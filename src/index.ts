import { aggiorna, type Snapshot } from './aggiorna';
import { PS } from './anagrafica';
import { archivia, leggi, pota, type Cattura } from './grezzo';
import { costruisciStorico, csvGiorno, salvaLetture } from './storico';
import { FONTI } from './registry';

interface Env {
  PS_KV: KVNamespace;
  DB: D1Database;
  /** Secret (wrangler secret put EXPORT_TOKEN): protegge l'export CSV usato dal backup su GitHub. */
  EXPORT_TOKEN?: string;
  ASSETS: Fetcher;
  /** Il Worker stesso: il cron gira fuori dal placement (Varsavia), le richieste no (Milano). */
  SELF: Fetcher;
}

const CHIAVE = 'palermo:snapshot';
const LOCK = 'palermo:lock';
const CHIAVE_STORICO = 'palermo:storico:v1';
/** Il calcolo dello storico legge settimane di righe: lo teniamo in KV e lo rifacciamo al massimo ogni 10 minuti. */
const STORICO_TTL_S = 600;
/** Oltre questa età l'API avvia un rinfresco in background (rete di sicurezza se il cron ritarda). */
const ETA_MAX_MS = 3 * 60_000;
const VUOTO = { lettura: null, acquisitaAlle: null, ultimoErrore: null };

async function snapshot(env: Env): Promise<Snapshot | null> {
  return env.PS_KV.get<Snapshot>(CHIAVE, 'json');
}

async function rinfresca(env: Env): Promise<void> {
  const catture: Cattura[] = [];
  const next = await aggiorna(await snapshot(env), FONTI, fetch, new Date(), catture);
  await env.PS_KV.put(CHIAVE, JSON.stringify(next));
  // Come lo storico: l'archivio grezzo non deve mai rompere la pagina in tempo reale.
  try {
    await archivia(env.DB, catture);
    if (new Date().getUTCMinutes() < 2) await pota(env.DB); // una volta all'ora basta
  } catch (e) { console.error('grezzo:', e instanceof Error ? e.message : e); }
  // Lo storico non deve mai rompere la pagina in tempo reale.
  try { await salvaLetture(env.DB, next); } catch (e) { console.error('storico:', e instanceof Error ? e.message : e); }
}

/** Un solo rinfresco alla volta: KV non è atomico, ma il lock da 60s evita la maggior parte delle sovrapposizioni. */
async function rinfrescaSeLibero(env: Env): Promise<void> {
  if (await env.PS_KV.get(LOCK)) return;
  await env.PS_KV.put(LOCK, '1', { expirationTtl: 60 });
  await rinfresca(env);
}

export default {
  // Cron (wrangler.toml): ogni 2 minuti legge le fonti e salva lo snapshot.
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Lo scraping deve partire da una richiesta, non dal cron: solo le richieste rispettano il placement.
    ctx.waitUntil(env.SELF.fetch('https://self.internal/api/refresh').then(() => undefined));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/refresh') {
      // Pubblico ma innocuo: rinfresca solo se lo snapshot ha più di 90s (il cron arriva ogni 120s), quindi chi lo chiama non può moltiplicare le letture.
      const snap = await snapshot(env);
      if (!snap || Date.now() - Date.parse(snap.aggiornatoAlle) > 90_000) await rinfrescaSeLibero(env);
      return new Response('ok');
    }
    if (pathname === '/api/palermo') {
      let snap = await snapshot(env);
      if (!snap) {
        // Primo avvio (o `wrangler dev` senza cron): popola subito, così la pagina non resta vuota.
        await rinfresca(env);
        snap = await snapshot(env);
      } else if (Date.now() - Date.parse(snap.aggiornatoAlle) > ETA_MAX_MS) ctx.waitUntil(rinfrescaSeLibero(env));
      const body = {
        aggiornatoAlle: snap?.aggiornatoAlle ?? null,
        ps: PS.map((p) => ({ ...p, ...(snap?.ps[p.id] ?? VUOTO) })),
      };
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
      });
    }
    if (pathname === '/api/storico') {
      let corpo = await env.PS_KV.get(CHIAVE_STORICO);
      if (!corpo) {
        corpo = JSON.stringify(await costruisciStorico(env.DB));
        await env.PS_KV.put(CHIAVE_STORICO, corpo, { expirationTtl: STORICO_TTL_S });
      }
      return new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }
    if (pathname === '/api/grezzo') {
      // Per rieseguire i parser sul passato: serve il token, come l'export CSV.
      if (!env.EXPORT_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.EXPORT_TOKEN}`) return new Response('non autorizzato', { status: 401 });
      const id = Number(new URL(req.url).searchParams.get('id'));
      if (Number.isInteger(id) && id > 0) {
        const c = await leggi(env.DB, id);
        return c?.corpo == null ? new Response('non trovato o senza corpo', { status: 404 }) : new Response(c.corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Fonte': c.fonte, 'X-Chiave': c.chiave, 'X-Ts': String(c.ts), 'X-Esito': encodeURIComponent(c.esito) } });
      }
      const { results } = await env.DB.prepare('SELECT id, fonte, chiave, ts, hash, byte, esito FROM grezzo ORDER BY id DESC LIMIT 100').all();
      return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/api/export.csv') {
      // Backup interno: serve il token, non è un'API pubblica.
      if (!env.EXPORT_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.EXPORT_TOKEN}`) return new Response('non autorizzato', { status: 401 });
      const csv = await csvGiorno(env.DB, new URL(req.url).searchParams.get('day') ?? '');
      return csv == null ? new Response('parametro day (YYYY-MM-DD) mancante o non valido', { status: 400 }) : new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(req);
  },
};
