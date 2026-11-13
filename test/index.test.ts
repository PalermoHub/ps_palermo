import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { d1Finto } from './d1';
import { fx } from './fx';

const MIGR = ['0001_letture.sql', '0002_grezzo.sql', '0003_stato.sql', '0004_download.sql', '0005_letture_estese.sql'];
const BASE = 'https://ps.example';
const TOKEN = 'segreto-di-prova';
const SITO = { 'Sec-Fetch-Site': 'same-origin', 'User-Agent': 'Mozilla/5.0' };
const risposte: Record<string, string> = {
  'ospedaliriunitipalermo.it': fx('riuniti.html'), 'arnascivico.it': fx('civico.html'), 'asppalermo.org': fx('asp.html'),
  'provinciaromanafbf.it': fx('buccheri.json'), 'ProntoSoccorsoIndici': fx('policlinico-indici.json'), 'ProntoSoccorso': fx('policlinico.json'),
};
let chiamateFonti = 0;
const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException() {} } as unknown as ExecutionContext;

function ambiente(over: Record<string, unknown> = {}, limiteOk = true) {
  const self = { fetch: vi.fn(async () => new Response('ok')) };
  return {
    DB: d1Finto(MIGR), EXPORT_TOKEN: TOKEN,
    LIMITE: { limit: vi.fn(async () => ({ success: limiteOk })) },
    ASSETS: { fetch: vi.fn(async () => new Response('<html>sito</html>')) }, SELF: self, ...over,
  } as never;
}
const chiama = (env: never, path: string, init: RequestInit = {}) => worker.fetch(new Request(BASE + path, init), env, ctx);
const conToken = { headers: { Authorization: `Bearer ${TOKEN}` } };

beforeEach(() => {
  chiamateFonti = 0;
  vi.stubGlobal('fetch', async (url: string) => { chiamateFonti++; return new Response(risposte[Object.keys(risposte).find((x) => String(url).includes(x))!]); });
});
afterEach(() => vi.unstubAllGlobals());

describe('accesso agli endpoint pubblici', () => {
  it('senza intestazioni del browser: 403', async () => {
    const r = await chiama(ambiente(), '/api/palermo');
    expect(r.status).toBe(403);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it('client da riga di comando (curl): 403 anche con Sec-Fetch-Site', async () => {
    expect((await chiama(ambiente(), '/api/palermo', { headers: { ...SITO, 'User-Agent': 'curl/8.5.0' } })).status).toBe(403);
  });
  it('dal sito: 200 con tutti gli 8 presidi (primo avvio popola da solo)', async () => {
    const r = await chiama(ambiente(), '/api/palermo', { headers: SITO });
    expect(r.status).toBe(200);
    const j = await r.json() as { ps: { id: string }[] };
    expect(j.ps).toHaveLength(8);
    expect(r.headers.get('Cache-Control')).toContain('max-age=30');
  });
  it('origine ammessa: risposta con CORS; origine estranea: 403 senza CORS', async () => {
    const ok = await chiama(ambiente(), '/api/palermo', { headers: { Origin: 'https://palermohub.opendatasicilia.it', 'Sec-Fetch-Site': 'cross-site', 'User-Agent': 'Mozilla/5.0' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://palermohub.opendatasicilia.it');
    expect(ok.headers.get('Vary')).toBe('Origin');
    const no = await chiama(ambiente(), '/api/palermo', { headers: { Origin: 'https://altro.it', 'Sec-Fetch-Site': 'cross-site', 'User-Agent': 'Mozilla/5.0' } });
    expect(no.status).toBe(403);
    expect(no.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('oltre il limite per IP: 429 con Retry-After', async () => {
    const r = await chiama(ambiente({}, false), '/api/palermo', { headers: SITO });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
  });
  it('il limite si applica per IP (CF-Connecting-IP)', async () => {
    const env = ambiente();
    await chiama(env, '/api/palermo', { headers: { ...SITO, 'CF-Connecting-IP': '203.0.113.9' } });
    expect((env as { LIMITE: { limit: ReturnType<typeof vi.fn> } }).LIMITE.limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
  });
});

describe('endpoint con token', () => {
  for (const path of ['/api/export.csv?day=2026-11-12', '/api/grezzo', '/api/dl-stat', '/api/stato']) {
    it(`${path}: senza token 401, con token sbagliato 401, con token 200`, async () => {
      const env = ambiente();
      expect((await chiama(env, path)).status).toBe(401);
      expect((await chiama(env, path, { headers: { Authorization: 'Bearer sbagliato' } })).status).toBe(401);
      expect((await chiama(env, path, conToken)).status).toBe(200);
    });
  }
  it('senza EXPORT_TOKEN configurato nessuno entra, nemmeno con «Bearer undefined»', async () => {
    const env = ambiente({ EXPORT_TOKEN: undefined });
    expect((await chiama(env, '/api/stato', { headers: { Authorization: 'Bearer undefined' } })).status).toBe(401);
  });
  it('export.csv: giorno non valido → 400', async () => {
    expect((await chiama(ambiente(), '/api/export.csv?day=ieri', conToken)).status).toBe(400);
  });
  it('/api/stato non è raggiungibile dal sito senza token (non è un endpoint pubblico)', async () => {
    expect((await chiama(ambiente(), '/api/stato', { headers: SITO })).status).toBe(401);
  });
});

describe('contatore dei download', () => {
  it('solo POST; file non valido → 400; valido → 204 e conteggio visibile', async () => {
    const env = ambiente();
    const file = encodeURIComponent('2026/2026-11-12.csv');
    expect((await chiama(env, `/api/dl?file=${file}`, { headers: SITO })).status).toBe(405);
    expect((await chiama(env, '/api/dl?file=../../etc/passwd', { method: 'POST', headers: SITO })).status).toBe(400);
    expect((await chiama(env, `/api/dl?file=${file}`, { method: 'POST', headers: SITO })).status).toBe(204);
    expect((await chiama(env, `/api/dl?file=${file}`, { method: 'POST', headers: SITO })).status).toBe(204);
    const c = await (await chiama(env, '/api/dl-conteggi', { headers: SITO })).json() as Record<string, number>;
    expect(c['2026/2026-11-12.csv']).toBe(2);
  });
  it('POST da fuori dal sito: 403, non conta', async () => {
    const env = ambiente();
    expect((await chiama(env, '/api/dl?file=descrizione-colonne.csv', { method: 'POST', headers: { 'User-Agent': 'curl/8' } })).status).toBe(403);
    expect(await (await chiama(env, '/api/dl-conteggi', { headers: SITO })).json()).toEqual({});
  });
});

describe('rinfresco e cron', () => {
  it('/api/refresh: la prima volta legge le fonti, la seconda (snapshot fresco) no', async () => {
    const env = ambiente();
    expect(await (await chiama(env, '/api/refresh')).text()).toBe('ok');
    const dopoPrima = chiamateFonti;
    expect(dopoPrima).toBeGreaterThanOrEqual(5);
    await chiama(env, '/api/refresh');
    expect(chiamateFonti).toBe(dopoPrima);
  });
  it('il rinfresco salva lo storico: una riga per presidio in `letture`', async () => {
    const env = ambiente() as { DB: D1Database };
    await chiama(env as never, '/api/refresh');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM letture').first<{ n: number }>();
    expect(n!.n).toBe(8);
  });
  it('lock: un rinfresco già in corso (lock recente) non ne avvia un altro', async () => {
    const env = ambiente() as { DB: D1Database };
    await env.DB.prepare("INSERT INTO stato (chiave, valore, ts) VALUES ('palermo:lock', '1', ?)").bind(Date.now()).run();
    await chiama(env as never, '/api/refresh');
    expect(chiamateFonti).toBe(0);
  });
  it('scheduled: il cron chiama /api/refresh tramite il binding SELF (rispetta il placement)', async () => {
    const env = ambiente() as { SELF: { fetch: ReturnType<typeof vi.fn> } };
    const attese: Promise<unknown>[] = [];
    await worker.scheduled({} as ScheduledController, env as never, { waitUntil: (p: Promise<unknown>) => attese.push(p) } as unknown as ExecutionContext);
    await Promise.all(attese);
    expect(env.SELF.fetch).toHaveBeenCalledTimes(1);
    expect(String(env.SELF.fetch.mock.calls[0]![0])).toContain('/api/refresh');
  });
  it('una fonte che cade non rompe /api/palermo: lettura vecchia + errore segnalato', async () => {
    const env = ambiente();
    await chiama(env, '/api/refresh');
    vi.stubGlobal('fetch', async (url: string) => (String(url).includes('asppalermo.org') ? new Response('', { status: 500 }) : new Response(risposte[Object.keys(risposte).find((x) => String(url).includes(x))!])));
    // forza un nuovo rinfresco: snapshot reso vecchio
    await (env as { DB: D1Database }).DB.prepare("UPDATE stato SET valore = json_set(valore, '$.aggiornatoAlle', '2020-01-01T00:00:00.000Z') WHERE chiave = 'palermo:snapshot'").run();
    await (env as { DB: D1Database }).DB.prepare("DELETE FROM stato WHERE chiave = 'palermo:lock'").run();
    await chiama(env, '/api/refresh');
    const j = await (await chiama(env, '/api/palermo', { headers: SITO })).json() as { ps: { id: string; lettura: unknown; ultimoErrore: string | null }[] };
    const ing = j.ps.find((p) => p.id === 'ingrassia-adulti')!;
    expect(ing.lettura).not.toBeNull();
    expect(ing.ultimoErrore).toContain('asp');
  });
});

describe('sito statico', () => {
  it('un percorso non API passa agli asset', async () => {
    const env = ambiente();
    expect(await (await chiama(env, '/grafici.html')).text()).toContain('sito');
    expect((env as { ASSETS: { fetch: ReturnType<typeof vi.fn> } }).ASSETS.fetch).toHaveBeenCalled();
  });
});
