import { describe, expect, it } from 'vitest';
import { verifica } from '../src/coerenza';
import type { Lettura } from '../src/types';

const C = (attesa: number | null, totale: number | null = null) => ({ attesa, trattamento: null, osservazione: null, totale });
const L = (o: Partial<Lettura>): Lettura => ({ psId: 'x', rilevataAlle: null, codici: {}, pazientiTotali: null, inAttesa: null, sovraffollamentoPct: null, postiTecnici: null, permanenza: null, tempiMediAttesaMin: null, ...o });
const esito = (l: Lettura, id: string) => verifica(l).controlli.find((c) => c.id === id)!.esito;

// Numeri reali di /api/palermo, 2026-11-12 07:08 CET (vedi docs/audit-fonti.md).
describe('formula dell\'indice: casi reali', () => {
  it('Villa Sofia: 56/30 = 186,7 → 187 (presenti, non permanenze 57/30 = 190)', () => {
    const l = L({ pazientiTotali: 56, postiTecnici: 30, sovraffollamentoPct: 187, permanenza: { meno24h: 37, da24a48h: 14, oltre48h: 6 } });
    expect(verifica(l).formulaIndice).toBe('presenti');
  });
  it('Di Cristina: 112 torna con permanenze (18/16 = 112,5), non con presenti (19/16 = 118,8)', () => {
    const l = L({ pazientiTotali: 19, postiTecnici: 16, sovraffollamentoPct: 112, permanenza: { meno24h: 13, da24a48h: 5, oltre48h: 0 } });
    expect(verifica(l).formulaIndice).toBe('permanenze');
  });
  it('Civico: 161,9 pubblicato come 161 (troncato) è comunque coerente; presenti = permanenze → «entrambe»', () => {
    const l = L({ pazientiTotali: 68, postiTecnici: 42, sovraffollamentoPct: 161, permanenza: { meno24h: 52, da24a48h: 11, oltre48h: 5 } });
    expect(verifica(l).formulaIndice).toBe('entrambe');
  });
  it('Ingrassia (due decimali) e Buccheri (intero) senza permanenze: solo «presenti» è verificabile', () => {
    expect(verifica(L({ pazientiTotali: 23, postiTecnici: 13, sovraffollamentoPct: 176.92 })).formulaIndice).toBe('presenti');
    expect(verifica(L({ pazientiTotali: 25, postiTecnici: 12, sovraffollamentoPct: 208 })).formulaIndice).toBe('presenti');
  });
  it('un indice che non torna con nessuna formula viene segnalato', () => {
    const l = L({ pazientiTotali: 50, postiTecnici: 30, sovraffollamentoPct: 250, permanenza: { meno24h: 40, da24a48h: 10, oltre48h: 0 } });
    expect(verifica(l).formulaIndice).toBe('nessuna');
    expect(esito(l, 'indice')).toBe('diverso');
  });
  it('Policlinico: indice calcolato da noi con presenti/posti (120%); il dettaglio resta esplicito e mostra l\'alternativa (152%)', () => {
    const l = L({ pazientiTotali: 30, postiTecnici: 25, sovraffollamentoPct: 120, sovraffollamentoCalcolato: true, permanenza: { meno24h: 21, da24a48h: 7, oltre48h: 10 } });
    const v = verifica(l);
    expect(v.formulaIndice).toBe('presenti');
    const ix = v.controlli.find((c) => c.id === 'indice')!;
    expect(ix.esito).toBe('ok');
    expect(ix.dettaglio).toMatch(/calcolato da noi.*presenti\/posti = 120%.*permanenze\/posti sarebbe 152%/);
  });
});

describe('permanenze e presenti', () => {
  const perm = (a: number, b: number, c: number) => ({ meno24h: a, da24a48h: b, oltre48h: c });
  it('scarto di 1 (Villa Sofia 57 vs 56, Di Cristina 18 vs 19) è tollerato', () => {
    expect(esito(L({ pazientiTotali: 56, permanenza: perm(37, 14, 6) }), 'permanenze-presenti')).toBe('ok');
    expect(esito(L({ pazientiTotali: 19, permanenza: perm(13, 5, 0) }), 'permanenze-presenti')).toBe('ok');
  });
  it('Policlinico 38 vs 30 (scarto 8) è segnalato', () => {
    expect(esito(L({ pazientiTotali: 30, permanenza: perm(21, 7, 10) }), 'permanenze-presenti')).toBe('diverso');
  });
  it('senza permanenze: non disponibile, non «ok»', () => {
    expect(esito(L({ pazientiTotali: 23 }), 'permanenze-presenti')).toBe('nd');
  });
});

describe('somme per codice', () => {
  it('attese per codice coerenti con «in attesa»; incoerenza segnalata; mancanti → nd', () => {
    expect(esito(L({ codici: { rosso: C(0), verde: C(4) }, inAttesa: 4 }), 'attesa-codici')).toBe('ok');
    expect(esito(L({ codici: { rosso: C(0), verde: C(4) }, inAttesa: 5 }), 'attesa-codici')).toBe('diverso');
    expect(esito(L({ codici: { rosso: C(null), verde: C(4) }, inAttesa: 4 }), 'attesa-codici')).toBe('nd');
  });
  it('totali per codice vs presenti', () => {
    expect(esito(L({ codici: { rosso: C(0, 30), verde: C(0, 38) }, pazientiTotali: 68 }), 'totale-codici')).toBe('ok');
    expect(esito(L({ codici: { rosso: C(0, 30), verde: C(0, 38) }, pazientiTotali: 70 }), 'totale-codici')).toBe('diverso');
    expect(esito(L({ codici: { rosso: C(0) }, pazientiTotali: 5 }), 'totale-codici')).toBe('nd');
  });
  it('lettura vuota: tutto «nd», nessuna eccezione', () => {
    const v = verifica(L({}));
    expect(v.formulaIndice).toBe('nd');
    expect(v.controlli.every((c) => c.esito === 'nd')).toBe(true);
  });
});
