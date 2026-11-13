import { describe, expect, it } from 'vitest';
import { aggiorna, type FetchFn } from '../src/aggiorna';
import { FONTI } from '../src/registry';
import { COLONNE, costruisciStorico, csvGiorno, salvaLetture, valoriLettura } from '../src/storico';
import { d1Finto } from './d1';
import { fx } from './fx';

const risposte: Record<string, string> = {
  'ospedaliriunitipalermo.it': fx('riuniti.html'), 'arnascivico.it': fx('civico.html'), 'asppalermo.org': fx('asp.html'),
  'provinciaromanafbf.it': fx('buccheri.json'), 'ProntoSoccorsoIndici': fx('policlinico-indici.json'), 'ProntoSoccorso': fx('policlinico.json'),
};
const rete: FetchFn = async (url) => new Response(risposte[Object.keys(risposte).find((x) => url.includes(x))!]);
const MIGR = ['0001_letture.sql', '0005_letture_estese.sql'];
const ORA = new Date('2026-11-12T10:30:00Z');

describe('storico: colonne estese', () => {
  it('salva una riga per presidio con tutte le colonne, anche i dati che prima si perdevano', async () => {
    const d = d1Finto(MIGR);
    const snap = await aggiorna(null, FONTI, rete, ORA);
    await salvaLetture(d, snap);
    const { results } = await d.prepare('SELECT * FROM letture').all<Record<string, any>>();
    expect(results).toHaveLength(8);
    const pol = results.find((r) => r.ps_id === 'policlinico-adulti')!;
    const l = snap.ps['policlinico-adulti']!.lettura!;
    expect(pol.posti).toBe(l.postiTecnici);
    expect(pol.perm_oltre48h).toBe(l.permanenza?.oltre48h ?? null);
    expect(pol.tm_rosso).toBe(l.tempiMediAttesaMin?.rosso ?? null);
    expect(pol.tratt_verde).toBe(l.codici.verde?.trattamento ?? null);
    // Il dato mancante resta NULL: mai uno 0 inventato.
    const buc = snap.ps['buccheri-adulti']!.lettura!;
    const rb = results.find((r) => r.ps_id === 'buccheri-adulti')!;
    expect(rb.tm_rosso).toBe(buc.tempiMediAttesaMin?.rosso ?? null);
  });

  it('valoriLettura e intestazione CSV hanno lo stesso numero di colonne', async () => {
    const d = d1Finto(MIGR);
    await salvaLetture(d, await aggiorna(null, FONTI, rete, ORA));
    const csv = (await csvGiorno(d, '2026-11-12'))!.trim().split('\n');
    const n = csv[0]!.split(',').length;
    expect(n).toBe(2 + valoriLettura(((await aggiorna(null, FONTI, rete, ORA)).ps['civico-adulti']!.lettura)!).length);
    expect(csv.length).toBe(9);
    expect(csv.slice(1).every((r) => r.split(',').length === n)).toBe(true);
    expect(csv[0]).toContain('perm_oltre48h');
  });

  it('le colonne aggiunte (da indice 10) e i valori (da indice 8) combaciano: lo usa scripts/backfill-letture.ts', async () => {
    const l = (await aggiorna(null, FONTI, rete, ORA)).ps['policlinico-adulti']!.lettura!;
    expect(COLONNE.slice(10)).toHaveLength(valoriLettura(l).slice(8).length);
    expect(COLONNE[10]).toBe('posti');
  });
});

describe('costruisciStorico', () => {
  const adesso = Date.parse('2026-11-12T12:10:00Z');
  const ts = (iso: string) => Date.parse(iso) / 1000;
  const riga = (d: D1Database, ps: string, iso: string, attesa: number | null) =>
    d.prepare('INSERT INTO letture (ps_id, ts, in_attesa) VALUES (?,?,?)').bind(ps, ts(iso), attesa).run();

  it('senza dati: serie vuote ma con la forma giusta (48 punti nelle 24 ore, 336 in 7 giorni)', async () => {
    const s = await costruisciStorico(d1Finto(MIGR), adesso);
    expect(s.passo).toBe(1800);
    expect(s.citta.ora).toHaveLength(336);
    expect(s.citta.prima).toHaveLength(336);
    expect(s.citta.ora.every((v) => v === null)).toBe(true);
    expect(s.spark.ps).toEqual({});
  });
  it('media dei valori nella mezz\'ora e arrotondamento a un decimale', async () => {
    const d = d1Finto(MIGR);
    await riga(d, 'ingrassia-adulti', '2026-11-12T11:35:00Z', 5);
    await riga(d, 'ingrassia-adulti', '2026-11-12T11:40:00Z', 6);
    await riga(d, 'ingrassia-adulti', '2026-11-12T11:45:00Z', 8);
    const s = await costruisciStorico(d, adesso);
    const sp = s.spark.ps['ingrassia-adulti']!;
    expect(sp).toHaveLength(48);
    expect(sp.filter((v) => v != null)).toEqual([6.3]); // (5+6+8)/3 = 6,33
  });
  it('i NULL non contano come zero (la fonte non pubblica il dato)', async () => {
    const d = d1Finto(MIGR);
    await riga(d, 'ingrassia-adulti', '2026-11-12T11:35:00Z', null);
    const s = await costruisciStorico(d, adesso);
    expect(s.spark.ps['ingrassia-adulti']).toBeUndefined();
  });
  it('totale città: nessun punto se risponde meno della metà dei presidi, un punto se ne rispondono almeno 4 su 8', async () => {
    const d = d1Finto(MIGR);
    const ids = ['villa-sofia-adulti', 'cervello-adulti', 'cervello-pediatrico', 'civico-adulti', 'di-cristina-pediatrico', 'policlinico-adulti', 'ingrassia-adulti', 'buccheri-adulti'];
    for (const id of ids.slice(0, 3)) await riga(d, id, '2026-11-12T11:35:00Z', 10);
    for (const id of ids.slice(0, 4)) await riga(d, id, '2026-11-12T10:05:00Z', 10);
    const s = await costruisciStorico(d, adesso);
    const punti = s.citta.ora.filter((v) => v != null);
    expect(punti).toEqual([40]); // 11:30–12:00 ha solo 3 presidi: scartato; 10:00–10:30 ne ha 4
  });
  it('csvGiorno: rifiuta date non valide e usa il giorno di Palermo (ora legale)', async () => {
    const d = d1Finto(MIGR);
    expect(await csvGiorno(d, '12/11/2026')).toBeNull();
    // 22:30 UTC del 12/11 = 23:30 a Roma (CET): è ancora il 12; 23:30 UTC = 00:30 del 13
    await riga(d, 'ingrassia-adulti', '2026-11-12T22:30:00Z', 1);
    await riga(d, 'ingrassia-adulti', '2026-11-12T23:30:00Z', 2);
    const c = (await csvGiorno(d, '2026-11-12'))!.trim().split('\n');
    expect(c).toHaveLength(2);
    expect(c[1]).toContain('2026-11-12T22:30:00Z');
  });
});
