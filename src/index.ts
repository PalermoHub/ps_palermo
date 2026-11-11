import { aggiorna, type Snapshot } from './aggiorna';
import { PS } from './anagrafica';
import { FONTI } from './registry';

interface Env {
  PS_KV: KVNamespace;
  ASSETS: Fetcher;
  /** Il Worker stesso: il cron gira fuori dal placement (Varsavia), le richieste no (Milano). */
  SELF: Fetcher;
}

const CHIAVE = 'palermo:snapshot';
const LOCK = 'palermo:lock';
/** Oltre questa età l'API avvia un rinfresco in background (rete di sicurezza se il cron ritarda). */
const ETA_MAX_MS = 3 * 60_000;
const VUOTO = { lettura: null, acquisitaAlle: null, ultimoErrore: null };

async function snapshot(env: Env): Promise<Snapshot | null> {
  return env.PS_KV.get<Snapshot>(CHIAVE, 'json');
}

async function rinfresca(env: Env): Promise<void> {
  const next = await aggiorna(await snapshot(env), FONTI, fetch);
  await env.PS_KV.put(CHIAVE, JSON.stringify(next));
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
    return env.ASSETS.fetch(req);
  },
};
