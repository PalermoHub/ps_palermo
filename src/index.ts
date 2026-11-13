import { aggiorna, type Snapshot } from './aggiorna';
import { PS } from './anagrafica';
import { verifica } from './coerenza';
import { valuta } from './freschezza';
import { archivia, leggi, pota, type Cattura } from './grezzo';
import { costruisciSalute } from './salute';
import { costruisciStorico, csvGiorno, salvaLetture } from './storico';
import { FONTI } from './registry';
import { conteggiDownload, contaDownload, fileValido } from './download';
import { API_SOLO_SITO, corsPer, dalSito } from './origine';

interface Env {
  DB: D1Database;
  /** Rate limit per IP sugli endpoint pubblici (wrangler.toml, [[ratelimits]]). */
  LIMITE: RateLimit;
  /** Secret (wrangler secret put EXPORT_TOKEN): protegge l'export CSV usato dal backup su GitHub. */
  EXPORT_TOKEN?: string;
  ASSETS: Fetcher;
  /** Il Worker stesso: il cron gira fuori dal placement (Varsavia), le richieste no (Milano). */
  SELF: Fetcher;
}

const CHIAVE = 'palermo:snapshot';
const LOCK = 'palermo:lock';
const CHIAVE_STORICO = 'palermo:storico:v1';
/** Il calcolo dello storico legge settimane di righe: lo teniamo in D1 e lo rifacciamo al massimo ogni 10 minuti. */
const STORICO_TTL_S = 600;
const CHIAVE_SALUTE = 'palermo:salute:v1';
const SALUTE_TTL_S = 300;
/** Oltre questa età l'API avvia un rinfresco in background (rete di sicurezza se il cron ritarda). */
const ETA_MAX_MS = 8 * 60_000;
const VUOTO = { lettura: null, acquisitaAlle: null, ultimoErrore: null };

async function snapshot(env: Env): Promise<Snapshot | null> {
  const r = await env.DB.prepare('SELECT valore FROM stato WHERE chiave = ?').bind(CHIAVE).first<{ valore: string }>();
  return r ? (JSON.parse(r.valore) as Snapshot) : null;
}

async function rinfresca(env: Env): Promise<void> {
  const catture: Cattura[] = [];
  const next = await aggiorna(await snapshot(env), FONTI, fetch, new Date(), catture);
  await env.DB.prepare('INSERT INTO stato (chiave, valore, ts) VALUES (?1, ?2, ?3) ON CONFLICT(chiave) DO UPDATE SET valore = ?2, ts = ?3')
    .bind(CHIAVE, JSON.stringify(next), Date.now()).run();
  // Come lo storico: l'archivio grezzo non deve mai rompere la pagina in tempo reale.
  try {
    await archivia(env.DB, catture);
    if (new Date().getUTCMinutes() < 2) await pota(env.DB); // una volta all'ora basta
  } catch (e) { console.error('grezzo:', e instanceof Error ? e.message : e); }
  // Lo storico non deve mai rompere la pagina in tempo reale.
  try { await salvaLetture(env.DB, next); } catch (e) { console.error('storico:', e instanceof Error ? e.message : e); }
}

/** Un solo rinfresco alla volta: lock atomico su D1 (una sola istruzione), scade dopo 60s. */
async function rinfrescaSeLibero(env: Env): Promise<void> {
  const ora = Date.now();
  const r = await env.DB.prepare("INSERT INTO stato (chiave, valore, ts) VALUES (?1, '1', ?2) ON CONFLICT(chiave) DO UPDATE SET ts = ?2 WHERE stato.ts < ?2 - 60000")
    .bind(LOCK, ora).run();
  if (!r.meta.changes) return;
  await rinfresca(env);
}

const gestore = {
  // Cron (wrangler.toml): ogni 5 minuti legge le fonti e salva lo snapshot.
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Lo scraping deve partire da una richiesta, non dal cron: solo le richieste rispettano il placement.
    ctx.waitUntil(env.SELF.fetch('https://self.internal/api/refresh').then(() => undefined));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (API_SOLO_SITO.has(pathname) && !dalSito(req)) return new Response('accesso consentito solo dal sito', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    if (API_SOLO_SITO.has(pathname)) {
      const { success } = await env.LIMITE.limit({ key: req.headers.get('CF-Connecting-IP') ?? 'anonimo' });
      if (!success) return new Response('troppe richieste, riprova tra poco', { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/api/dl') {
      if (req.method !== 'POST') return new Response('metodo non consentito', { status: 405, headers: { Allow: 'POST' } });
      const file = new URL(req.url).searchParams.get('file') ?? '';
      if (!fileValido(file)) return new Response('file non valido', { status: 400, headers: { 'Cache-Control': 'no-store' } });
      await contaDownload(env.DB, file);
      return new Response(null, { status: 204 });
    }
    if (pathname === '/api/dl-stat') {
      // Statistiche per il gestore: serve il token, come l'export CSV.
      if (!env.EXPORT_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.EXPORT_TOKEN}`) return new Response('non autorizzato', { status: 401 });
      return new Response(JSON.stringify(await conteggiDownload(env.DB)), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/api/refresh') {
      // Pubblico ma innocuo: rinfresca solo se lo snapshot ha più di 270s (il cron arriva ogni 300s), quindi chi lo chiama non può moltiplicare le letture.
      const snap = await snapshot(env);
      if (!snap || Date.now() - Date.parse(snap.aggiornatoAlle) > 270_000) await rinfrescaSeLibero(env);
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
        ps: PS.map((p) => {
          const s = snap?.ps[p.id] ?? VUOTO;
          return { ...p, ...s, affidabilita: valuta(s, new Date()), coerenza: s.lettura ? verifica(s.lettura) : null };
        }),
      };
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
      });
    }
    if (pathname === '/api/storico') {
      // Cache in D1 (non in KV: il limite di scritture giornaliero di KV è già stato superato una volta).
      const c = await env.DB.prepare('SELECT valore, ts FROM stato WHERE chiave = ?').bind(CHIAVE_STORICO).first<{ valore: string; ts: number }>();
      let corpo = c && Date.now() - c.ts < STORICO_TTL_S * 1000 ? c.valore : null;
      if (!corpo) {
        corpo = JSON.stringify(await costruisciStorico(env.DB));
        await env.DB.prepare('INSERT INTO stato (chiave, valore, ts) VALUES (?1, ?2, ?3) ON CONFLICT(chiave) DO UPDATE SET valore = ?2, ts = ?3').bind(CHIAVE_STORICO, corpo, Date.now()).run();
      }
      return new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }
    if (pathname === '/api/salute') {
      // Stessa cache in D1 dello storico (le letture di 24 ore sono migliaia di righe): al massimo un ricalcolo ogni 5 minuti.
      const c = await env.DB.prepare('SELECT valore, ts FROM stato WHERE chiave = ?').bind(CHIAVE_SALUTE).first<{ valore: string; ts: number }>();
      let corpo = c && Date.now() - c.ts < SALUTE_TTL_S * 1000 ? c.valore : null;
      if (!corpo) {
        corpo = JSON.stringify(await costruisciSalute(env.DB, await snapshot(env)));
        await env.DB.prepare('INSERT INTO stato (chiave, valore, ts) VALUES (?1, ?2, ?3) ON CONFLICT(chiave) DO UPDATE SET valore = ?2, ts = ?3').bind(CHIAVE_SALUTE, corpo, Date.now()).run();
      }
      return new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' } });
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

export default {
  scheduled: gestore.scheduled,
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const res = await gestore.fetch(req, env, ctx);
    const cors = API_SOLO_SITO.has(new URL(req.url).pathname) ? corsPer(req) : {};
    if (!Object.keys(cors).length) return res;
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
