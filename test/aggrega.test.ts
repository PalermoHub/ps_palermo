import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const TESTA = 'ps_id,rilevato_utc,in_attesa,totale';
let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

/** Crea i CSV giornalieri indicati (una riga ciascuno) e lancia scripts/aggrega.mjs su una cartella temporanea. */
function esegui(giorni: Record<string, string | null>) {
  dir = mkdtempSync(join(tmpdir(), 'aggrega-'));
  for (const [g, riga] of Object.entries(giorni)) {
    mkdirSync(join(dir, g.slice(0, 4)), { recursive: true });
    writeFileSync(join(dir, g.slice(0, 4), `${g}.csv`), `${TESTA}\n${riga == null ? '' : riga + '\n'}`);
  }
  execFileSync('node', ['scripts/aggrega.mjs'], { env: { ...process.env, DIR_STORICO: dir }, encoding: 'utf8' });
  return {
    indice: JSON.parse(readFileSync(join(dir, 'indice.json'), 'utf8')) as { giorni: { id: string; righe: number }[]; settimane: { id: string; da: string; a: string; giorni: number; righe: number }[]; mesi: { id: string }[] },
    esiste: (f: string) => existsSync(join(dir, f)),
    leggi: (f: string) => readFileSync(join(dir, f), 'utf8'),
  };
}
const r = (g: string) => `a,${g}T10:00:00Z,1,2`;

describe('scripts/aggrega.mjs', () => {
  it('una settimana ISO si scrive solo quando è finita (domenica compresa nei giorni letti)', () => {
    // lun 9 – dom 15 novembre 2026 = W46; l'ultimo giorno disponibile è mercoledì 11: settimana ancora aperta
    const a = esegui({ '2026-11-09': r('2026-11-09'), '2026-11-10': r('2026-11-10'), '2026-11-11': r('2026-11-11') });
    expect(a.indice.settimane).toEqual([]);
    expect(a.esiste('settimane/2026-W46.csv')).toBe(false);
  });
  it('settimana chiusa: file con lunedì–domenica e righe dei soli giorni presenti', () => {
    const a = esegui({ '2026-11-09': r('2026-11-09'), '2026-11-10': r('2026-11-10'), '2026-11-16': r('2026-11-16') });
    expect(a.indice.settimane).toHaveLength(1);
    expect(a.indice.settimane[0]).toMatchObject({ id: '2026-W46', da: '2026-11-09', a: '2026-11-15', giorni: 2, righe: 2 });
    expect(a.leggi('settimane/2026-W46.csv').trim().split('\n')).toHaveLength(3); // testa + 2 righe
  });
  it('cambio d\'anno: 28/12/2026–3/1/2027 è la settimana 2026-W53 (il giovedì decide l\'anno)', () => {
    const a = esegui({ '2026-12-31': r('2026-12-31'), '2027-01-01': r('2027-01-01'), '2027-01-04': r('2027-01-04') });
    expect(a.indice.settimane.map((s) => s.id)).toEqual(['2026-W53']);
    expect(a.indice.settimane[0]).toMatchObject({ da: '2026-12-28', a: '2027-01-03', righe: 2 });
    expect(a.indice.mesi.map((m) => m.id)).toEqual(['2026-12']); // gennaio è ancora aperto
  });
  it('un mese si scrive solo quando c\'è la sua ultima giornata', () => {
    const a = esegui({ '2026-11-20': r('2026-11-20'), '2026-11-29': r('2026-11-29') });
    expect(a.indice.mesi).toEqual([]); // manca il 30: mese aperto
    const b = esegui({ '2026-11-20': r('2026-11-20'), '2026-11-30': r('2026-11-30') });
    expect(b.indice.mesi.map((m) => m.id)).toEqual(['2026-11']); // i CSV sono giorni interi: col 30 il mese è completo
  });
  it('giorni con il solo intestazione (nessuna riga) non entrano nell\'indice', () => {
    const a = esegui({ '2026-11-11': null, '2026-11-12': r('2026-11-12') });
    expect(a.indice.giorni.map((g) => g.id)).toEqual(['2026-11-12']);
  });
  it('colonne aggiunte in coda: i giorni vecchi si completano con campi vuoti, tutte le righe hanno la stessa larghezza', () => {
    const a = esegui({ '2026-11-09': r('2026-11-09'), '2026-11-10': `a,2026-11-10T10:00:00Z,1,2` , '2026-11-16': r('2026-11-16') });
    expect(a.indice.settimane).toHaveLength(1);
    const widths = new Set(a.leggi('settimane/2026-W46.csv').trim().split('\n').map((l) => l.split(',').length));
    expect(widths.size).toBe(1);
  });
});
