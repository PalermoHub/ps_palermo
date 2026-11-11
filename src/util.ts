import { type Codice, type ConteggiCodice } from './types';

const MESI: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

/** Primo intero in una stringa ("7 paz." -> 7, "261.54 %" -> 261.54). null se assente. */
export function numero(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = s.replace(/ /g, ' ').match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

export function testo(s: string | null | undefined): string {
  return (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Offset di Europe/Rome (minuti) per un istante UTC. */
function offsetRomaMin(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Data/ora locale di Roma -> ISO con offset (es. 2026-11-11T19:24:34+01:00). */
export function romaIso(y: number, mo: number, d: number, h: number, mi: number, s = 0): string {
  const comeUtc = Date.UTC(y, mo - 1, d, h, mi, s); // l'ora locale letta "come se" fosse UTC
  const off = offsetRomaMin(comeUtc - offsetRomaMin(comeUtc) * 60000);
  const a = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  const l = new Date(comeUtc);
  return (
    `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}` +
    `T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:${pad(l.getUTCSeconds())}` +
    `${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

/** "11/11/2026 19:24:34" o "11/11/26 - 19:21:57" */
export function dataOraNumerica(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  return romaIso(y, Number(m[2]), Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/** "11 Novembre 2026 19:16" */
export function dataOraMeseEsteso(s: string): string | null {
  const m = s.toLowerCase().match(/(\d{1,2})\s+([a-zì]+)\s+(\d{4})\D+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mese = MESI[m[2]!];
  if (!mese) return null;
  return romaIso(Number(m[3]), mese, Number(m[1]), Number(m[4]), Number(m[5]));
}

/** "2h  25m " -> 145, "22m " -> 22, "3h " -> 180 */
export function durataMin(s: string): number | null {
  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m/i);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

export function conteggi(p: Partial<ConteggiCodice> = {}): ConteggiCodice {
  return { attesa: null, trattamento: null, osservazione: null, totale: null, ...p };
}

export const CODICE_DA_NOME: Record<string, Codice> = {
  rosso: 'rosso', arancione: 'arancione', azzurro: 'azzurro', verde: 'verde', bianco: 'bianco',
};
