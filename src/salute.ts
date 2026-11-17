import { FONTE_DI_PS, type Snapshot } from './aggiorna';
import { PS } from './anagrafica';
import { valuta, type Affidabilita } from './freschezza';
import { FONTI } from './registry';
import type { StatoFonte, StatoFonti } from './allarmi';

/**
 * «Salute dei dati»: per ogni fonte, com'è andata nelle ultime 24 ore a finestre di 30 minuti.
 *
 * Stato di una finestra (un carattere):
 *  n  dato nuovo      almeno una lettura con valori diversi dalla precedente dello stesso presidio
 *  s  invariato       letture presenti, ma con gli stessi valori
 *  e  errore          nessuna lettura e la fonte era in errore (rete o parser)
 *  x  nessuna lettura niente dati e niente errore registrato: il nostro cron non ha girato o non ha salvato
 *
 * Perché `letture` e non l'hash di `grezzo` per dire «invariato»: parecchie fonti scrivono l'ora della richiesta nella
 * pagina, quindi il corpo grezzo cambia anche a numeri fermi. E `grezzo` salva una riga solo quando l'esito cambia:
 * un'interruzione lunga è UNA riga di errore, valida fino alla riga successiva della stessa fonte/chiave.
 */
export const PASSO_SALUTE = 1800;
export const FINESTRE = 48;

export interface SaluteFonte {
  id: string;
  nome: string;
  presidi: string[];
  /** Un carattere per finestra, dalla più vecchia (24 ore fa) alla più recente. */
  stati: string;
  /** Quante volte la fonte è passata da funzionante a in errore nelle 24 ore (anche una iniziata prima). */
  episodiErrore: number;
  /** Quando i valori di un presidio della fonte sono cambiati l'ultima volta (ISO UTC). */
  ultimoNuovoAlle: string | null;
  /** Stato attuale secondo `valuta()` (lo stesso del banner «dati non aggiornati»), il peggiore tra i presidi. */
  stato: Affidabilita;
  motivo: string | null;
}

export interface Salute {
  generatoAlle: string;
  passo: number;
  /** Inizio della prima finestra, secondi unix UTC. */
  da: number;
  fonti: SaluteFonte[];
}

const NOMI: Record<string, string> = {
  riuniti: 'Ospedali Riuniti Villa Sofia-Cervello',
  civico: 'ARNAS Civico',
  policlinico: 'Policlinico',
  asp: 'ASP Palermo',
  buccheri: 'Fatebenefratelli',
};

/** Dal meno al più grave: la fonte prende lo stato del suo presidio messo peggio. */
const GRAVITA: Affidabilita[] = ['ok', 'sospetto', 'assente', 'vecchio', 'congelato', 'errore'];

interface RigaLettura { ps_id: string; ts: number; in_attesa: number | null; totale: number | null; sovraff: number | null; att_rosso: number | null; att_arancione: number | null; att_azzurro: number | null; att_verde: number | null; att_bianco: number | null }
interface RigaGrezzo { fonte: string; chiave: string; ts: number; esito: string }

/**
 * Le letture delle ultime 24 ore. Niente `ORDER BY ps_id, ts`: quell'ordine combacia con la chiave primaria di
 * `letture` (ps_id, ts), quindi SQLite la sceglie per risparmiarsi l'ordinamento e finisce per scansionare tutta la
 * tabella (15.000 righe invece di 2.400). Con il solo filtro su `ts` usa l'indice `letture_ts`; l'ordine lo dà il sort qui sotto.
 */
export const SQL_LETTURE = 'SELECT ps_id, ts, in_attesa, totale, sovraff, att_rosso, att_arancione, att_azzurro, att_verde, att_bianco FROM letture WHERE ts >= ?';

export async function costruisciSalute(db: D1Database, snap: Snapshot | null, adesso = Date.now()): Promise<Salute> {
  const ora = Math.floor(adesso / 1000);
  const fine = Math.floor(ora / PASSO_SALUTE) * PASSO_SALUTE + PASSO_SALUTE;
  const da = fine - FINESTRE * PASSO_SALUTE;
  const finestra = (ts: number) => Math.floor((ts - da) / PASSO_SALUTE);

  // Una finestra di margine prima di `da`: serve come termine di confronto per la prima lettura.
  const { results: letture } = await db.prepare(SQL_LETTURE).bind(da - PASSO_SALUTE).all<RigaLettura>();
  letture.sort((a, b) => (a.ps_id === b.ps_id ? a.ts - b.ts : a.ps_id < b.ps_id ? -1 : 1));
  // Le righe di errore valgono fino alla riga successiva: serve anche l'ultima riga PRIMA della finestra.
  // Si cerca chiave per chiave sull'indice (fonte, chiave, ts) partendo da `grezzo_ultimo`, invece del
  // `id IN (SELECT MAX(id) ... GROUP BY fonte, chiave)` che faceva un full scan di `grezzo` a ogni ricalcolo.
  const { results: dentro } = await db.prepare('SELECT fonte, chiave, ts, esito FROM grezzo WHERE ts >= ?1').bind(da).all<RigaGrezzo>();
  const { results: ultimi } = await db.prepare('SELECT fonte, chiave FROM grezzo_ultimo').all<{ fonte: string; chiave: string }>();
  const chiavi = new Map<string, { fonte: string; chiave: string }>();
  for (const k of [...ultimi, ...dentro]) chiavi.set(JSON.stringify([k.fonte, k.chiave]), { fonte: k.fonte, chiave: k.chiave });
  const prima: RigaGrezzo[] = chiavi.size
    ? (await db.batch([...chiavi.values()].map((k) => db.prepare('SELECT fonte, chiave, ts, esito FROM grezzo WHERE fonte = ?1 AND chiave = ?2 AND ts < ?3 ORDER BY ts DESC LIMIT 1').bind(k.fonte, k.chiave, da)))).flatMap((r) => r.results as unknown as RigaGrezzo[])
    : [];
  const grezzo = [...prima, ...dentro].sort((a, b) => (a.fonte !== b.fonte ? (a.fonte < b.fonte ? -1 : 1) : a.chiave !== b.chiave ? (a.chiave < b.chiave ? -1 : 1) : a.ts - b.ts));

  const righe = new Map<string, { ha: boolean[]; nuovo: boolean[]; ultimoNuovo: number | null }>();
  const per = (id: string) => righe.get(id) ?? (righe.set(id, { ha: Array(FINESTRE).fill(false), nuovo: Array(FINESTRE).fill(false), ultimoNuovo: null }), righe.get(id)!);

  let prec: string | null = null, precPs = '';
  for (const r of letture) {
    const fonte = FONTE_DI_PS[r.ps_id];
    if (!fonte) continue;
    if (r.ps_id !== precPs) { precPs = r.ps_id; prec = null; }
    const chiave = JSON.stringify([r.in_attesa, r.totale, r.sovraff, r.att_rosso, r.att_arancione, r.att_azzurro, r.att_verde, r.att_bianco]);
    // Nessun termine di confronto (primissima lettura del presidio): la contiamo come nuova.
    const cambiata = prec === null || chiave !== prec;
    prec = chiave;
    const f = per(fonte), w = finestra(r.ts);
    if (cambiata) f.ultimoNuovo = Math.max(f.ultimoNuovo ?? 0, r.ts);
    if (w < 0 || w >= FINESTRE) continue;
    f.ha[w] = true;
    if (cambiata) f.nuovo[w] = true;
  }

  // Intervalli di errore per fonte: da una riga non-ok fino alla riga successiva della stessa chiave (o fino ad adesso).
  const errore = new Map<string, boolean[]>(), episodi = new Map<string, number>();
  for (let i = 0; i < grezzo.length; i++) {
    const g = grezzo[i]!;
    if (g.esito === 'ok') continue;
    const succ = grezzo[i + 1] && grezzo[i + 1]!.fonte === g.fonte && grezzo[i + 1]!.chiave === g.chiave ? grezzo[i + 1]!.ts : ora;
    const w0 = Math.max(0, finestra(Math.max(g.ts, da))), w1 = Math.min(FINESTRE - 1, finestra(Math.max(succ - 1, da)));
    const e = errore.get(g.fonte) ?? Array(FINESTRE).fill(false);
    for (let w = w0; w <= w1; w++) e[w] = true;
    errore.set(g.fonte, e);
    episodi.set(g.fonte, (episodi.get(g.fonte) ?? 0) + 1);
  }

  const adesso_ = new Date(adesso);
  const fonti: SaluteFonte[] = FONTI.map((fonte) => {
    const f = per(fonte.id), e = errore.get(fonte.id);
    const stati = Array.from({ length: FINESTRE }, (_, w) => (f.ha[w] ? (f.nuovo[w] ? 'n' : 's') : e?.[w] ? 'e' : 'x')).join('');
    const ids = PS.filter((p) => FONTE_DI_PS[p.id] === fonte.id);
    let stato: Affidabilita = 'ok', motivo: string | null = null;
    if (!snap) { stato = 'assente'; motivo = 'nessuna lettura'; }
    else for (const p of ids) {
      const v = valuta(snap.ps[p.id] ?? { lettura: null, acquisitaAlle: null, ultimoErrore: null }, adesso_);
      if (GRAVITA.indexOf(v.stato) > GRAVITA.indexOf(stato)) { stato = v.stato; motivo = v.motivo; }
    }
    return {
      id: fonte.id, nome: NOMI[fonte.id] ?? fonte.id, presidi: ids.map((p) => p.nome), stati,
      episodiErrore: episodi.get(fonte.id) ?? 0,
      ultimoNuovoAlle: f.ultimoNuovo ? new Date(f.ultimoNuovo * 1000).toISOString() : null,
      stato, motivo,
    };
  });
  return { generatoAlle: adesso_.toISOString(), passo: PASSO_SALUTE, da, fonti };
}

/** Stato di ogni fonte in una riga, senza toccare il database: serve all'Action di allarme. */
export function statoFonti(snap: Snapshot | null, adesso = new Date()): StatoFonti {
  const fonti = FONTI.map((fonte): StatoFonte => {
    const ids = PS.filter((p) => FONTE_DI_PS[p.id] === fonte.id);
    let stato: Affidabilita = snap ? 'ok' : 'assente', motivo: string | null = snap ? null : 'nessuna lettura', etaMin: number | null = null;
    for (const p of ids) {
      const s = snap?.ps[p.id] ?? { lettura: null, acquisitaAlle: null, ultimoErrore: null };
      const v = valuta(s, adesso);
      if (GRAVITA.indexOf(v.stato) > GRAVITA.indexOf(stato)) { stato = v.stato; motivo = v.motivo; }
      if (s.acquisitaAlle) {
        const m = Math.max(0, Math.round((adesso.getTime() - Date.parse(s.acquisitaAlle)) / 60_000));
        etaMin = etaMin == null ? m : Math.max(etaMin, m);
      }
    }
    return { id: fonte.id, nome: NOMI[fonte.id] ?? fonte.id, stato, motivo, etaMin };
  });
  return { generatoAlle: adesso.toISOString(), aggiornatoAlle: snap && snap.aggiornatoAlle !== new Date(0).toISOString() ? snap.aggiornatoAlle : null, fonti };
}
