import { describe, expect, it } from 'vitest';
import { dataOraMeseEsteso, dataOraNumerica, durataMin, numero, romaIso, sommaOnesta } from '../src/util';

describe('util', () => {
  it('numero', () => {
    expect(numero('7 paz.')).toBe(7);
    expect(numero('261.54 %')).toBe(261.54);
    expect(numero('abc')).toBeNull();
    expect(numero(undefined)).toBeNull();
  });
  it('durataMin', () => {
    expect(durataMin('2h  25m ')).toBe(145);
    expect(durataMin('22m ')).toBe(22);
    expect(durataMin('3h ')).toBe(180);
    expect(durataMin('')).toBeNull();
  });
  it('fuso di Roma: inverno +01:00, estate +02:00', () => {
    expect(romaIso(2026, 11, 11, 19, 24, 34)).toBe('2026-11-11T19:24:34+01:00');
    expect(romaIso(2026, 7, 1, 12, 0, 0)).toBe('2026-07-01T12:00:00+02:00');
  });
  it('formati data delle fonti', () => {
    expect(dataOraNumerica('11/11/26 - 19:21:57')).toBe('2026-11-11T19:21:57+01:00');
    expect(dataOraNumerica('11/11/2026 19:24:34')).toBe('2026-11-11T19:24:34+01:00');
    expect(dataOraMeseEsteso('11 Novembre 2026 19:16')).toBe('2026-11-11T19:16:00+01:00');
    expect(dataOraMeseEsteso('boh')).toBeNull();
  });
  it('sommaOnesta: un dato mancante rende la somma «non disponibile», mai un totale parziale', () => {
    expect(sommaOnesta([1, 2, 3])).toBe(6);
    expect(sommaOnesta([0, 0])).toBe(0);
    expect(sommaOnesta([1, null, 3])).toBeNull();
    expect(sommaOnesta([null, null])).toBeNull();
    expect(sommaOnesta([])).toBeNull();
  });
});
