import type { Affidabilita } from './freschezza';

/** Riepilogo per fonte, letto dall'Action di controllo (endpoint /api/stato, protetto dal token). */
export interface StatoFonte {
  id: string;
  nome: string;
  stato: Affidabilita;
  motivo: string | null;
  /** Minuti dall'ultima nostra lettura riuscita di un presidio della fonte (il più vecchio); null se mai letta. */
  etaMin: number | null;
}
export interface StatoFonti {
  generatoAlle: string;
  /** Ultimo giro del cron/rinfresco, ISO UTC (null = mai). */
  aggiornatoAlle: string | null;
  fonti: StatoFonte[];
}

/** Un solo errore di rete o di parser non deve svegliare nessuno: la fonte deve essere ferma da almeno questi minuti. */
export const ERRORE_MIN = 30;
/** Il Worker stesso non gira più (cron fermo): l'ultimo giro è più vecchio di così. */
export const WORKER_FERMO_MIN = 20;

export interface Problema {
  /** Chiave stabile: diventa il titolo dell'issue (una per problema). */
  chiave: string;
  titolo: string;
  dettaglio: string;
}

/**
 * Quali problemi meritano un'issue. Regole prudenti, per non fare rumore:
 *  - errore: solo se la fonte è irraggiungibile da almeno ERRORE_MIN minuti (la lettura buona resta, ma vecchia);
 *  - vecchio / congelato / assente: sempre (le soglie sono già in freschezza.ts);
 *  - «sospetto» no: le soglie sono ancora provvisorie.
 */
export function problemi(s: StatoFonti, adesso = new Date()): Problema[] {
  const out: Problema[] = [];
  const giro = s.aggiornatoAlle ? Math.round((adesso.getTime() - Date.parse(s.aggiornatoAlle)) / 60_000) : null;
  if (giro == null || giro > WORKER_FERMO_MIN) {
    out.push({ chiave: 'worker', titolo: 'Allarme dati: il Worker non aggiorna più', dettaglio: giro == null ? 'Nessun giro di aggiornamento registrato.' : `Ultimo giro ${giro} minuti fa (soglia ${WORKER_FERMO_MIN}).` });
  }
  for (const f of s.fonti) {
    const grave = f.stato === 'vecchio' || f.stato === 'congelato' || f.stato === 'assente'
      || (f.stato === 'errore' && f.etaMin != null && f.etaMin >= ERRORE_MIN);
    if (grave) out.push({ chiave: f.id, titolo: `Allarme dati: ${f.nome}`, dettaglio: `Stato «${f.stato}»${f.motivo ? `: ${f.motivo}` : ''}${f.etaMin != null ? `. Ultima lettura nostra ${f.etaMin} minuti fa.` : '.'}` });
  }
  return out;
}
