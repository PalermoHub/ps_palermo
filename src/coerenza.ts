import type { Lettura } from './types';

export type Esito = 'ok' | 'diverso' | 'nd';
export interface Controllo { id: string; esito: Esito; dettaglio: string }

/** Con quale formula torna l'indice di sovraffollamento che la fonte pubblica. */
export type FormulaIndice = 'presenti' | 'permanenze' | 'entrambe' | 'nessuna' | 'nd';

export interface Coerenza {
  formulaIndice: FormulaIndice;
  controlli: Controllo[];
}

/** Tolleranza sull'indice: le fonti arrotondano o troncano (161,9 → 161) e a volte hanno decimali (176,92). */
const TOLL_INDICE = 1;
/** Permanenze e presenti sono grandezze vicine ma non identiche (istanti diversi): scarto accettato max(2, 10%). */
const tollPresenti = (n: number) => Math.max(2, Math.round(n * 0.1));

const somma = (v: (number | null)[]) => (v.length && v.every((x) => x != null) ? (v as number[]).reduce((s, x) => s + x, 0) : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Controlli interni a UNA lettura: non provano che il dato sia giusto, solo che la fonte non si contraddice. */
export function verifica(l: Lettura): Coerenza {
  const controlli: Controllo[] = [];
  const cod = Object.values(l.codici);

  const sa = somma(cod.map((c) => c.attesa));
  controlli.push(sa == null || l.inAttesa == null
    ? { id: 'attesa-codici', esito: 'nd', dettaglio: 'attese per codice o totale non disponibili' }
    : { id: 'attesa-codici', esito: sa === l.inAttesa ? 'ok' : 'diverso', dettaglio: `Σ codici = ${sa}, «in attesa» = ${l.inAttesa}` });

  const st = somma(cod.map((c) => c.totale));
  controlli.push(st == null || l.pazientiTotali == null
    ? { id: 'totale-codici', esito: 'nd', dettaglio: 'totali per codice non pubblicati' }
    : { id: 'totale-codici', esito: st === l.pazientiTotali ? 'ok' : 'diverso', dettaglio: `Σ codici = ${st}, presenti = ${l.pazientiTotali}` });

  const p = l.permanenza;
  const sp = p ? somma([p.meno24h, p.da24a48h, p.oltre48h]) : null;
  if (sp == null || l.pazientiTotali == null) controlli.push({ id: 'permanenze-presenti', esito: 'nd', dettaglio: 'permanenze non pubblicate' });
  else {
    const d = Math.abs(sp - l.pazientiTotali);
    controlli.push({ id: 'permanenze-presenti', esito: d <= tollPresenti(l.pazientiTotali) ? 'ok' : 'diverso', dettaglio: `Σ permanenze = ${sp}, presenti = ${l.pazientiTotali} (scarto ${d})` });
  }

  const { sovraffollamentoPct: ix, postiTecnici: posti } = l;
  let formulaIndice: FormulaIndice = 'nd';
  if (ix != null && posti) {
    const daPresenti = l.pazientiTotali != null ? (l.pazientiTotali / posti) * 100 : null;
    const daPerm = sp != null ? (sp / posti) * 100 : null;
    const a = daPresenti != null && Math.abs(daPresenti - ix) < TOLL_INDICE;
    const b = daPerm != null && Math.abs(daPerm - ix) < TOLL_INDICE;
    formulaIndice = a && b ? 'entrambe' : a ? 'presenti' : b ? 'permanenze' : 'nessuna';
    const num = (x: number | null) => (x == null ? 'n.d.' : `${r1(x)}%`);
    if (l.sovraffollamentoCalcolato) {
      controlli.push({ id: 'indice', esito: formulaIndice === 'nessuna' ? 'diverso' : 'ok', dettaglio: `calcolato da noi (presenti/posti = ${num(daPresenti)}), non pubblicato dalla fonte; con permanenze/posti sarebbe ${num(daPerm)}` });
    } else {
      controlli.push({ id: 'indice', esito: formulaIndice === 'nessuna' ? 'diverso' : 'ok', dettaglio: `pubblicato ${ix}%; presenti/posti = ${num(daPresenti)}, permanenze/posti = ${num(daPerm)}` });
    }
  } else controlli.push({ id: 'indice', esito: 'nd', dettaglio: 'indice o posti tecnici non disponibili' });

  return { formulaIndice, controlli };
}
