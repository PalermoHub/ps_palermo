import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/aggiorna';
import { costruisciSalute, FINESTRE } from '../src/salute';
import { d1Finto } from './d1';

const MIGRAZIONI = ['0001_letture.sql', '0002_grezzo.sql', '0003_stato.sql'];
// 12:10 del 12/11: l'ultima finestra è 12:00-12:30, la prima (indice 0) parte alle 12:30 dell'11/11.
const ADESSO = Date.parse('2026-11-12T12:10:00Z');
const t = (iso: string) => Date.parse(iso) / 1000;
const ASP = 'ingrassia-adulti';

async function db() {
  const d = d1Finto(MIGRAZIONI);
  return {
    d,
    lettura: (ps: string, iso: string, attesa: number, totale = 20) =>
      d.prepare('INSERT INTO letture (ps_id, ts, in_attesa, totale, sovraff) VALUES (?,?,?,?,?)').bind(ps, t(iso), attesa, totale, 100).run(),
    grezzo: (fonte: string, iso: string, esito: string, chiave = 'k') =>
      d.prepare('INSERT INTO grezzo (fonte, chiave, ts, hash, byte, corpo, esito) VALUES (?,?,?,?,?,?,?)').bind(fonte, chiave, t(iso), esito === 'ok' ? 'h' : null, 1, null, esito).run(),
  };
}
const asp = (s: Awaited<ReturnType<typeof costruisciSalute>>) => s.fonti.find((f) => f.id === 'asp')!;

describe('salute dei dati', () => {
  it('senza dati: 48 finestre «nessuna lettura» per ognuna delle 5 fonti', async () => {
    const { d } = await db();
    const s = await costruisciSalute(d, null, ADESSO);
    expect(s.fonti.map((f) => f.id)).toEqual(['riuniti', 'civico', 'policlinico', 'asp', 'buccheri']);
    for (const f of s.fonti) {
      expect(f.stati).toBe('x'.repeat(FINESTRE));
      expect(f.stato).toBe('assente');
      expect(f.ultimoNuovoAlle).toBeNull();
      expect(f.episodiErrore).toBe(0);
    }
    expect(s.da).toBe(t('2026-11-11T12:30:00Z'));
  });

  it('distingue dato nuovo e invariato guardando i valori, non il corpo grezzo', async () => {
    const { d, lettura } = await db();
    await lettura(ASP, '2026-11-12T11:35:00Z', 5); // prima lettura in assoluto: nuova
    await lettura(ASP, '2026-11-12T12:02:00Z', 5); // stessi valori: invariata
    await lettura(ASP, '2026-11-12T12:04:00Z', 5);
    const f = asp(await costruisciSalute(d, null, ADESSO));
    expect(f.stati).toBe('x'.repeat(FINESTRE - 2) + 'ns'); // 11:30 nuovo, 12:00 invariato
    expect(f.ultimoNuovoAlle).toBe('2026-11-12T11:35:00.000Z');

    await lettura(ASP, '2026-11-12T12:06:00Z', 6); // cambia: l'ultima finestra diventa «nuovo»
    const g = asp(await costruisciSalute(d, null, ADESSO));
    expect(g.stati.at(-1)).toBe('n');
    expect(g.ultimoNuovoAlle).toBe('2026-11-12T12:06:00.000Z');
  });

  it('la prima lettura della finestra si confronta con quella appena prima, anche fuori finestra', async () => {
    const { d, lettura } = await db();
    await lettura(ASP, '2026-11-11T12:10:00Z', 5); // prima della finestra (12:30): fa da termine di confronto
    await lettura(ASP, '2026-11-11T12:40:00Z', 5); // dentro, stessi valori
    expect(asp(await costruisciSalute(d, null, ADESSO)).stati[0]).toBe('s');
  });

  it('un errore vale fino alla riga successiva: le finestre senza letture diventano «errore»', async () => {
    const { d, lettura, grezzo } = await db();
    await grezzo('asp', '2026-11-12T10:10:00Z', 'rete: HTTP 500');
    await grezzo('asp', '2026-11-12T11:10:00Z', 'ok'); // la fonte è tornata
    await lettura(ASP, '2026-11-12T11:35:00Z', 5);
    const f = asp(await costruisciSalute(d, null, ADESSO));
    // finestre 10:00, 10:30, 11:00 (indici 43-45) in errore; 11:30 ha la lettura
    expect(f.stati.slice(42, 47)).toBe('xeeen');
    expect(f.episodiErrore).toBe(1);
  });

  it('un errore iniziato prima della finestra e mai chiuso copre tutto fino a ora', async () => {
    const { d, grezzo } = await db();
    await grezzo('asp', '2026-11-10T08:00:00Z', 'parse: asp: cambiato il formato');
    const f = asp(await costruisciSalute(d, null, ADESSO));
    expect(f.stati).toBe('e'.repeat(FINESTRE));
    expect(f.episodiErrore).toBe(1);
  });

  it('gli errori di una fonte non toccano le altre; una chiave sana non cancella l\'errore dell\'altra', async () => {
    const { d, grezzo } = await db();
    await grezzo('policlinico', '2026-11-12T11:00:00Z', 'rete: timeout', 'indici');
    await grezzo('policlinico', '2026-11-12T11:05:00Z', 'ok', 'principale');
    const s = await costruisciSalute(d, null, ADESSO);
    // la chiave «indici» resta in errore da 11:00 a ora (finestre 11:00, 11:30, 12:00); l'ok di «principale» non la cancella
    expect(s.fonti.find((f) => f.id === 'policlinico')!.stati.slice(-4)).toBe('xeee');
    expect(s.fonti.find((f) => f.id === 'asp')!.stati).toBe('x'.repeat(FINESTRE));
  });

  it('lo stato attuale viene da valuta() ed è il peggiore tra i presidi della fonte', async () => {
    const { d } = await db();
    const ora = new Date(ADESSO).toISOString();
    const lett = { psId: 'x', rilevataAlle: null, codici: {}, pazientiTotali: 1, inAttesa: 1, sovraffollamentoPct: null, postiTecnici: null, permanenza: null, tempiMediAttesaMin: null };
    const snap = {
      aggiornatoAlle: ora,
      ps: {
        'villa-sofia-adulti': { lettura: lett, acquisitaAlle: ora, ultimoErrore: null },
        'cervello-adulti': { lettura: lett, acquisitaAlle: ora, ultimoErrore: 'riuniti: HTTP 500' },
        [ASP]: { lettura: lett, acquisitaAlle: ora, ultimoErrore: null },
      },
    } as unknown as Snapshot;
    const s = await costruisciSalute(d, snap, ADESSO);
    const r = s.fonti.find((f) => f.id === 'riuniti')!;
    expect(r.stato).toBe('errore');
    expect(r.motivo).toContain('HTTP 500');
    expect(r.presidi).toEqual(['Villa Sofia', 'Cervello', 'Cervello Pediatrico']);
    expect(asp(s).stato).toBe('ok');
  });
});
