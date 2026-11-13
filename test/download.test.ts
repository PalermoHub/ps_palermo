import { describe, expect, it } from 'vitest';
import { conteggiDownload, contaDownload, fileValido } from '../src/download';
import { d1Finto } from './d1';

const OGGI = new Date('2026-11-13T09:00:00Z');

describe('fileValido', () => {
  it('ammette i nomi dell\'archivio', () => {
    for (const f of ['2026/2026-11-12.csv', '2026/2026-11-13.csv', 'settimane/2026-W45.csv', 'mesi/2026-10.csv', 'descrizione-colonne.csv'])
      expect(fileValido(f, OGGI), f).toBe(true);
  });
  it('rifiuta nomi inventati, date impossibili, future o fuori anno', () => {
    for (const f of ['', '../x.csv', '2026/2026-11-14.csv', '2026/2026-02-30.csv', '2025/2025-11-12.csv', '2026/2027-01-01.csv', '2027/2027-01-01.csv',
      'settimane/2026-W00.csv', 'settimane/2026-W54.csv', 'mesi/2026-13.csv', 'mesi/2027-01.csv', 'indice.json', '2026/2026-11-12.csv?x=1', 'altro/2026-11-12.csv'])
      expect(fileValido(f, OGGI), f).toBe(false);
  });
});

describe('contatore', () => {
  it('una riga per file, n cresce', async () => {
    const db = d1Finto(['0004_download.sql']);
    await contaDownload(db, 'a.csv', 1000);
    await contaDownload(db, 'a.csv', 2000);
    await contaDownload(db, 'b.csv', 3000);
    const r = await conteggiDownload(db);
    expect(r).toEqual([
      { file: 'a.csv', n: 2, primo: '1970-01-01T00:00:01.000Z', ultimo: '1970-01-01T00:00:02.000Z' },
      { file: 'b.csv', n: 1, primo: '1970-01-01T00:00:03.000Z', ultimo: '1970-01-01T00:00:03.000Z' },
    ]);
  });
});
