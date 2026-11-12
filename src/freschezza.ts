import type { StatoPs } from './aggiorna';
import type { Lettura } from './types';

/**
 * Soglie PROVVISORIE, calibrate su 6,2 ore di storico (notte → mattina, 2026-11-12): in quella finestra nessun
 * presidio è rimasto identico più di 102 min (Ingrassia, il più quieto), gli altri al massimo 68 min.
 * Da ricalibrare con qualche settimana di dati (giorno/notte/festivi) prima di fidarsi dei falsi positivi.
 */
export const SOGLIA_SOSPETTO_MIN = 120;
export const SOGLIA_CONGELATO_MIN = 240;
/** Nostra lettura più vecchia di così senza errori = il cron ritarda o non gira. */
export const SOGLIA_NOSTRA_ETA_MIN = 10;
/** Orario dichiarato dalla fonte più vecchio, al momento in cui l'abbiamo letto, di così. */
export const SOGLIA_ETA_FONTE_MIN = 30;

export type Affidabilita = 'ok' | 'sospetto' | 'congelato' | 'vecchio' | 'errore' | 'assente';

export interface Freschezza {
  stato: Affidabilita;
  /** Da quanti minuti i numeri sono identici (null se non lo sappiamo). */
  invariataMin: number | null;
  /** Scarto tra la nostra lettura e l'orario dichiarato dalla fonte, se la fonte lo pubblica. */
  etaFonteMin: number | null;
  motivo: string | null;
}

/**
 * Impronta dei soli numeri. `rilevataAlle` è esclusa di proposito: parecchie fonti (verificato il 2026-11-12 su Civico,
 * Buccheri, ASP e Riuniti) lo valorizzano con l'ora della richiesta, quindi cambia a ogni lettura anche a dati fermi.
 */
export function firma(l: Lettura): string {
  const { rilevataAlle: _, ...numeri } = l;
  return JSON.stringify(numeri);
}

/** Aggiorna `invariataDal`: resta com'è se i numeri sono gli stessi dell'ultima lettura, altrimenti riparte da `ora`. */
export function invariataDal(prev: StatoPs | undefined, nuova: Lettura, ora: Date): string {
  if (prev?.lettura && firma(prev.lettura) === firma(nuova)) return prev.invariataDal ?? prev.acquisitaAlle ?? ora.toISOString();
  return ora.toISOString();
}

const min = (da: string | null | undefined, a: Date) => (da ? Math.max(0, Math.round((a.getTime() - Date.parse(da)) / 60_000)) : null);

export function valuta(s: StatoPs, adesso: Date): Freschezza {
  if (!s.lettura) return { stato: 'assente', invariataMin: null, etaFonteMin: null, motivo: 'nessuna lettura' };
  const invariataMin = min(s.invariataDal ?? s.acquisitaAlle, adesso);
  const nostraEta = min(s.acquisitaAlle, adesso);
  const etaFonteMin = s.lettura.rilevataAlle && s.acquisitaAlle
    ? Math.max(0, Math.round((Date.parse(s.acquisitaAlle) - Date.parse(s.lettura.rilevataAlle)) / 60_000))
    : null;
  const f = (stato: Affidabilita, motivo: string | null): Freschezza => ({ stato, invariataMin, etaFonteMin, motivo });

  if (s.ultimoErrore) return f('errore', s.ultimoErrore);
  if (nostraEta != null && nostraEta > SOGLIA_NOSTRA_ETA_MIN) return f('vecchio', `nostra lettura di ${nostraEta} min fa`);
  if (etaFonteMin != null && etaFonteMin > SOGLIA_ETA_FONTE_MIN) return f('vecchio', `orario della fonte di ${etaFonteMin} min prima della lettura`);
  if (invariataMin != null && invariataMin >= SOGLIA_CONGELATO_MIN) return f('congelato', `numeri identici da ${invariataMin} min`);
  if (invariataMin != null && invariataMin >= SOGLIA_SOSPETTO_MIN) return f('sospetto', `numeri identici da ${invariataMin} min`);
  return f('ok', null);
}
