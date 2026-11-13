import { describe, expect, it } from 'vitest';
import { aggiorna, type FetchFn } from '../src/aggiorna';
import { FONTI } from '../src/registry';
import { csvGiorno, salvaLetture, valoriLettura } from '../src/storico';
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
});
