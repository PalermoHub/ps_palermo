import { PS } from './anagrafica';
import type { Snapshot } from './aggiorna';
import { CODICI, type Lettura } from './types';

const TZ = 'Europe/Rome';
export const COLONNE = [
  'ps_id', 'ts', 'in_attesa', 'totale', 'sovraff', ...CODICI.map((c) => `att_${c}`),
  // Aggiunte con la migrazione 0005: in coda, così i CSV già pubblicati restano validi (righe più corte = NULL).
  'posti', 'perm_meno24h', 'perm_24_48h', 'perm_oltre48h',
  ...(['tot', 'tratt', 'oss', 'tm'] as const).flatMap((p) => CODICI.map((c) => `${p}_${c}`)),
] as const;

/** Valori nello stesso ordine di COLONNE (dopo ps_id e ts). */
export function valoriLettura(l: Lettura): (number | null)[] {
  const c = (k: 'totale' | 'trattamento' | 'osservazione') => CODICI.map((x) => l.codici[x]?.[k] ?? null);
  return [
    l.inAttesa, l.pazientiTotali, l.sovraffollamentoPct, ...CODICI.map((x) => l.codici[x]?.attesa ?? null),
    l.postiTecnici, l.permanenza?.meno24h ?? null, l.permanenza?.da24a48h ?? null, l.permanenza?.oltre48h ?? null,
    ...c('totale'), ...c('trattamento'), ...c('osservazione'), ...CODICI.map((x) => l.tempiMediAttesaMin?.[x] ?? null),
  ];
}

/** Salva una riga per ogni presidio letto in QUESTO giro (acquisitaAlle == ora): le letture vecchie non si duplicano. */
export async function salvaLetture(db: D1Database, snap: Snapshot): Promise<void> {
  const ts = Math.floor(Date.parse(snap.aggiornatoAlle) / 60_000) * 60;
  const stmt = db.prepare(`INSERT OR REPLACE INTO letture (${COLONNE.join(',')}) VALUES (${COLONNE.map(() => '?').join(',')})`);
  const righe = PS.flatMap((p) => {
    const s = snap.ps[p.id];
    if (!s?.lettura || s.acquisitaAlle !== snap.aggiornatoAlle) return [];
    const l = s.lettura;
    return [stmt.bind(p.id, ts, ...valoriLettura(l))];
  });
  if (righe.length) await db.batch(righe);
}

interface Riga { ps_id: string; b: number; v: number }

export interface Storico {
  generatoAlle: string;
  /** Passo in secondi di `spark` e `citta`. */
  passo: number;
  /** Ultime 24h, un valore ogni `passo` secondi dalle `da`: media dei pazienti in attesa (null = nessuna lettura). */
  spark: { da: number; ps: Record<string, (number | null)[]> };
  /** Per presidio, ultimi 7 giorni (stesso passo e stessa origine di `citta`). */
  ps7: Record<string, (number | null)[]>;
  /** Totale città, ultimi 7 giorni, e gli stessi 7 giorni della settimana precedente. */
  citta: { da: number; ora: (number | null)[]; prima: (number | null)[] };
}

const PASSO = 1800;

/** Calcolo pesante (legge fino a 8 settimane): il chiamante lo mette in cache. */
export async function costruisciStorico(db: D1Database, adesso = Date.now()): Promise<Storico> {
  const now = Math.floor(adesso / 1000);
  const fine = Math.floor(now / PASSO) * PASSO + PASSO;
  const daCitta = fine - 7 * 86400, daPrima = daCitta - 7 * 86400;
  const n = 7 * 86400 / PASSO;

  // Ultime 2 settimane a 30 minuti. La heatmap (8 settimane) non è qui: la calcola la Action dai CSV su GitHub.
  const mezz = await db.prepare(`SELECT ps_id, CAST(ts / ${PASSO} AS INTEGER) AS b, AVG(in_attesa) AS v FROM letture WHERE ts >= ? AND in_attesa IS NOT NULL GROUP BY ps_id, b`).bind(daPrima).all<Riga>();

  const b0 = fine / PASSO - n; // primo bucket della finestra "adesso"
  const spark: Record<string, (number | null)[]> = {}, ps7: Record<string, (number | null)[]> = {};
  const ora: (number | null)[] = Array(n).fill(null), prima: (number | null)[] = Array(n).fill(null);
  const nPs = PS.length;
  const cnt: number[] = Array(2 * n).fill(0);
  for (const r of mezz.results) {
    const i = r.b - (b0 - n); // 0..2n-1
    if (i < 0 || i >= 2 * n) continue;
    if (i >= n) {
      const k = i - n, ult = n - 48; // ultime 24h
      if (k >= ult) (spark[r.ps_id] ??= Array(48).fill(null))[k - ult] = Math.round(r.v * 10) / 10;
      (ps7[r.ps_id] ??= Array(n).fill(null))[k] = Math.round(r.v * 10) / 10;
      ora[k] = (ora[k] ?? 0) + r.v;
    } else prima[i] = (prima[i] ?? 0) + r.v;
    cnt[i]!++;
  }
  // Un totale città con troppi presidi mancanti sarebbe una buca falsa: meglio nessun punto.
  const minPs = Math.max(1, Math.ceil(nPs / 2));
  const chiudi = (a: (number | null)[], off: number) => a.forEach((v, i) => { a[i] = v != null && cnt[i + off]! >= minPs ? Math.round(v * 10) / 10 : null; });
  // `cnt` conta presidi per bucket (una riga per presidio e bucket).
  chiudi(prima, 0); chiudi(ora, n);

  return { generatoAlle: new Date(adesso).toISOString(), passo: PASSO, spark: { da: fine - 86400, ps: spark }, ps7, citta: { da: daCitta, ora, prima } };
}

/** CSV delle righe di un giorno locale (Europe/Rome), per l'archivio aperto su GitHub. */
export async function csvGiorno(db: D1Database, giorno: string): Promise<string | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return null;
  // Finestra ±1 giorno attorno alla mezzanotte UTC, poi filtro sul giorno locale (gestisce ora legale).
  const base = Date.parse(`${giorno}T00:00:00Z`) / 1000;
  const { results } = await db.prepare(`SELECT ${COLONNE.join(',')} FROM letture WHERE ts >= ? AND ts < ? ORDER BY ts, ps_id`).bind(base - 7200, base + 86400 + 7200).all<Record<string, number | string | null>>();
  const dtf = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const righe = results.filter((r) => dtf.format(new Date((r.ts as number) * 1000)) === giorno);
  const iso = (ts: number) => new Date(ts * 1000).toISOString().replace('.000Z', 'Z');
  return [['ps_id', 'rilevato_utc', ...COLONNE.slice(2)].join(','), ...righe.map((r) => [r.ps_id, iso(r.ts as number), ...COLONNE.slice(2).map((c) => r[c] ?? '')].join(','))].join('\n') + '\n';
}
