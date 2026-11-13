import { describe, expect, it } from 'vitest';
import { aggiorna, type FetchFn } from '../src/aggiorna';
import { problemi, type StatoFonti } from '../src/allarmi';
import { FONTI } from '../src/registry';
import { statoFonti } from '../src/salute';
import { fx } from './fx';

const ORA = new Date('2026-11-13T12:00:00Z');
const base = (over: Partial<StatoFonti['fonti'][number]> = {}, giroMin = 3): StatoFonti => ({
  generatoAlle: ORA.toISOString(), aggiornatoAlle: new Date(ORA.getTime() - giroMin * 60_000).toISOString(),
  fonti: [{ id: 'asp', nome: 'ASP Palermo', stato: 'ok', motivo: null, etaMin: 4, ...over }],
});

describe('allarmi: cosa merita un\'issue', () => {
  it('tutto ok: nessun problema', () => expect(problemi(base(), ORA)).toEqual([]));
  it('un errore recente (1-2 giri) non allarma', () => expect(problemi(base({ stato: 'errore', motivo: 'HTTP 500', etaMin: 10 }), ORA)).toEqual([]));
  it('errore da 30 minuti o più allarma', () => {
    const p = problemi(base({ stato: 'errore', motivo: 'HTTP 500', etaMin: 35 }), ORA);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ chiave: 'asp', titolo: 'Allarme dati: ASP Palermo' });
    expect(p[0]!.dettaglio).toContain('HTTP 500');
  });
  it('vecchio, congelato e assente allarmano; sospetto no', () => {
    for (const stato of ['vecchio', 'congelato', 'assente'] as const) expect(problemi(base({ stato }), ORA)).toHaveLength(1);
    expect(problemi(base({ stato: 'sospetto' }), ORA)).toEqual([]);
  });
  it('cron fermo: allarme sul Worker anche se le fonti sembrano ok', () => {
    const p = problemi(base({}, 45), ORA);
    expect(p.map((x) => x.chiave)).toEqual(['worker']);
    expect(problemi({ ...base(), aggiornatoAlle: null }, ORA)[0]!.chiave).toBe('worker');
  });
});

describe('statoFonti', () => {
  const risposte: Record<string, string> = {
    'ospedaliriunitipalermo.it': fx('riuniti.html'), 'arnascivico.it': fx('civico.html'), 'asppalermo.org': fx('asp.html'),
    'provinciaromanafbf.it': fx('buccheri.json'), 'ProntoSoccorsoIndici': fx('policlinico-indici.json'), 'ProntoSoccorso': fx('policlinico.json'),
  };
  const rete: FetchFn = async (url) => new Response(risposte[Object.keys(risposte).find((x) => url.includes(x))!]);

  it('senza snapshot: tutte le fonti «assente»', () => {
    const s = statoFonti(null, ORA);
    expect(s.aggiornatoAlle).toBeNull();
    expect(s.fonti.map((f) => f.stato)).toEqual(Array(5).fill('assente'));
  });
  it('fonte in errore da 40 minuti: errore con età 40', async () => {
    const snap = await aggiorna(null, FONTI, rete, new Date(ORA.getTime() - 40 * 60_000));
    const guasto: FetchFn = async (url) => (url.includes('asppalermo.org') ? new Response('', { status: 500 }) : rete(url));
    const dopo = await aggiorna(snap, FONTI, guasto, ORA);
    const s = statoFonti(dopo, ORA);
    const asp = s.fonti.find((f) => f.id === 'asp')!;
    expect(asp.stato).toBe('errore');
    expect(asp.etaMin).toBe(40);
    expect(problemi(s, ORA).map((p) => p.chiave)).toContain('asp');
    expect(s.fonti.filter((f) => f.id !== 'asp').every((f) => f.stato !== 'errore')).toBe(true); // le fixture hanno l'orario dell'11/11, quindi «ok» non si può pretendere
  });
});
