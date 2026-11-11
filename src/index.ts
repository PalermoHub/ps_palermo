import { aggiorna, type Snapshot } from './aggiorna';
import { PS } from './anagrafica';
import { FONTI } from './registry';

interface Env {
  PS_KV: KVNamespace;
  ASSETS: Fetcher;
}

const CHIAVE = 'palermo:snapshot';
const VUOTO = { lettura: null, acquisitaAlle: null, ultimoErrore: null };

async function snapshot(env: Env): Promise<Snapshot | null> {
  return env.PS_KV.get<Snapshot>(CHIAVE, 'json');
}

async function rinfresca(env: Env): Promise<void> {
  const next = await aggiorna(await snapshot(env), FONTI, fetch);
  await env.PS_KV.put(CHIAVE, JSON.stringify(next));
}

export default {
  // Cron (wrangler.toml): ogni 2 minuti legge le fonti e salva lo snapshot.
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(rinfresca(env));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/palermo') {
      let snap = await snapshot(env);
      if (!snap) {
        // Primo avvio (o `wrangler dev` senza cron): popola subito, così la pagina non resta vuota.
        await rinfresca(env);
        snap = await snapshot(env);
      }
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
