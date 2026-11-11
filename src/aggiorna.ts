import { PS } from './anagrafica';
import type { Fonte, Lettura } from './types';

export interface StatoPs {
  lettura: Lettura | null;
  /** Quando NOI abbiamo ottenuto l'ultima lettura valida (ISO UTC). */
  acquisitaAlle: string | null;
  /** Ultimo errore della fonte, se l'ultimo tentativo è fallito (la lettura precedente resta visibile). */
  ultimoErrore: string | null;
}

export interface Snapshot {
  aggiornatoAlle: string;
  ps: Record<string, StatoPs>;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 20_000;
const UA = 'palermo-ps/0.1 (monitor pubblico tempi di attesa)';

async function scarica(f: FetchFn, r: Fonte['richieste'][number]): Promise<string> {
  const t0 = Date.now();
  const host = new URL(r.url).host;
  try {
    const res = await f(r.url, {
      method: r.method ?? 'GET',
      headers: { 'User-Agent': UA, ...r.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    // Dettaglio utile a distinguere blocchi, lentezza e errori di rete (finisce in `ultimoErrore`).
    const causa = e instanceof Error ? e.message : String(e);
    throw new Error(`${host} dopo ${Date.now() - t0}ms: ${causa}`);
  }
}

export function snapshotVuoto(): Snapshot {
  return { aggiornatoAlle: new Date(0).toISOString(), ps: Object.fromEntries(PS.map((p) => [p.id, { lettura: null, acquisitaAlle: null, ultimoErrore: null }])) };
}

/**
 * Interroga tutte le fonti in parallelo. Una fonte che fallisce NON cancella l'ultima lettura buona:
 * si registra l'errore e il dato resta, con la sua età visibile (acquisitaAlle).
 */
export async function aggiorna(prev: Snapshot | null, fonti: Fonte[], f: FetchFn, ora = new Date()): Promise<Snapshot> {
  const base = prev ?? snapshotVuoto();
  const next: Snapshot = { aggiornatoAlle: ora.toISOString(), ps: structuredClone(base.ps) };
  for (const p of PS) next.ps[p.id] ??= { lettura: null, acquisitaAlle: null, ultimoErrore: null };

  const esiti = await Promise.allSettled(
    fonti.map(async (fonte) => {
      const corpi = await Promise.all(fonte.richieste.map((r) => scarica(f, r)));
      return { fonte, letture: fonte.parse(corpi) };
    }),
  );

  esiti.forEach((esito, i) => {
    const fonte = fonti[i]!;
    if (esito.status === 'fulfilled') {
      for (const l of esito.value.letture) {
        next.ps[l.psId] = { lettura: l, acquisitaAlle: ora.toISOString(), ultimoErrore: null };
      }
    } else {
      const msg = `${fonte.id}: ${esito.reason instanceof Error ? esito.reason.message : String(esito.reason)}`;
      console.error(msg);
      // Marca l'errore su tutti i PS che dipendono da questa fonte.
      for (const p of PS) {
        if (dipende(fonte, p.id)) next.ps[p.id] = { ...next.ps[p.id]!, ultimoErrore: msg };
      }
    }
  });
  return next;
}

const FONTE_DI_PS: Record<string, string> = {
  'villa-sofia-adulti': 'riuniti', 'cervello-adulti': 'riuniti', 'cervello-pediatrico': 'riuniti',
  'civico-adulti': 'civico', 'di-cristina-pediatrico': 'civico',
  'policlinico-adulti': 'policlinico', 'ingrassia-adulti': 'asp', 'buccheri-adulti': 'buccheri',
};
function dipende(fonte: Fonte, psId: string): boolean {
  return FONTE_DI_PS[psId] === fonte.id;
}
