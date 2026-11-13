import { describe, expect, it } from 'vitest';
import { aggiorna, type FetchFn, type StatoPs } from '../src/aggiorna';
import { firma, valuta } from '../src/freschezza';
import { FONTI } from '../src/registry';
import { fx } from './fx';

const T = (min: number) => new Date(Date.parse('2026-11-12T10:00:00Z') + min * 60_000);
const risposte = (buccheri = fx('buccheri.json')): Record<string, string> => ({
  'ospedaliriunitipalermo.it': fx('riuniti.html'), 'arnascivico.it': fx('civico.html'), 'asppalermo.org': fx('asp.html'),
  'provinciaromanafbf.it': buccheri, 'ProntoSoccorsoIndici': fx('policlinico-indici.json'), 'ProntoSoccorso': fx('policlinico.json'),
});
const con = (r: Record<string, string>): FetchFn => async (url) => new Response(r[Object.keys(r).find((x) => url.includes(x))!]);

describe('fonte congelata: numeri invariati', () => {
  it('stessi numeri a ogni giro: «invariata dal» resta il primo istante', async () => {
    const f = con(risposte());
    let s = await aggiorna(null, FONTI, f, T(0));
    s = await aggiorna(s, FONTI, f, T(2));
    s = await aggiorna(s, FONTI, f, T(250));
    expect(s.ps['policlinico-adulti']!.invariataDal).toBe(T(0).toISOString());
    // Policlinico non pubblica l'orario di rilevazione: l'unico segnale è che i numeri non cambiano.
    expect(valuta(s.ps['policlinico-adulti']!, T(250))).toMatchObject({ stato: 'congelato', etaFonteMin: null });
  });
  it('se i numeri cambiano riparte da capo, e un\'altra fonte ferma non ne risente', async () => {
    let s = await aggiorna(null, FONTI, con(risposte()), T(0));
    const j = JSON.parse(fx('buccheri.json'));
    j.pazientiInAttesa.totalePazienti = (j.pazientiInAttesa.totalePazienti ?? 0) + 1;
    s = await aggiorna(s, FONTI, con(risposte(JSON.stringify(j))), T(200));
    expect(s.ps['buccheri-adulti']!.invariataDal).toBe(T(200).toISOString());
    expect(s.ps['policlinico-adulti']!.invariataDal).toBe(T(0).toISOString());
  });
  it('un vecchio snapshot senza «invariataDal» riparte dall\'ultima lettura (nessun crash, nessun falso allarme)', () => {
    const vecchio = { lettura: { psId: 'x' } as never, acquisitaAlle: T(0).toISOString(), ultimoErrore: null } satisfies StatoPs;
    expect(valuta(vecchio, T(1)).invariataMin).toBe(1);
  });
  it('la firma ignora rilevataAlle (molte fonti la scrivono con l\'ora della richiesta)', async () => {
    const s = await aggiorna(null, FONTI, con(risposte()), T(0));
    const l = s.ps['civico-adulti']!.lettura!;
    expect(firma(l)).toBe(firma({ ...l, rilevataAlle: '2030-01-01T00:00:00+01:00' }));
    expect(firma(l)).not.toBe(firma({ ...l, pazientiTotali: (l.pazientiTotali ?? 0) + 1 }));
  });
});

describe('valuta: soglie e priorità', () => {
  const base = (over: Partial<StatoPs> & { rilevataAlle?: string | null } = {}): StatoPs => ({
    lettura: { psId: 'x', rilevataAlle: over.rilevataAlle ?? null } as never,
    acquisitaAlle: T(0).toISOString(), invariataDal: T(0).toISOString(), ultimoErrore: null, ...over,
  });
  it.each([[119, 'ok'], [120, 'sospetto'], [239, 'sospetto'], [240, 'congelato']])('invariata da %i min -> %s', (m, atteso) => {
    const s = base({ acquisitaAlle: T(m).toISOString() });
    expect(valuta(s, T(m)).stato).toBe(atteso);
  });
  it('nessuna lettura -> assente; errore ha la precedenza su tutto', () => {
    expect(valuta({ lettura: null, acquisitaAlle: null, ultimoErrore: null }, T(0)).stato).toBe('assente');
    expect(valuta(base({ ultimoErrore: 'riuniti: HTTP 522', invariataDal: T(-999).toISOString() }), T(5))).toMatchObject({ stato: 'errore', motivo: 'riuniti: HTTP 522' });
  });
  it('nostra lettura vecchia di oltre 15 min senza errori -> vecchio (cron in ritardo)', () => {
    expect(valuta(base(), T(16)).stato).toBe('vecchio');
    expect(valuta(base(), T(15)).stato).toBe('ok');
  });
  it('orario della fonte indietro di oltre 30 min rispetto alla lettura -> vecchio; senza orario non si inventa nulla', () => {
    const s = base({ rilevataAlle: T(-31).toISOString() });
    expect(valuta(s, T(0))).toMatchObject({ stato: 'vecchio', etaFonteMin: 31 });
    expect(valuta(base({ rilevataAlle: null }), T(0))).toMatchObject({ stato: 'ok', etaFonteMin: null });
  });
});
