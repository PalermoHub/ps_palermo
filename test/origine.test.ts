import { describe, expect, it } from 'vitest';
import { corsPer, dalSito } from '../src/origine';

const r = (h: Record<string, string>) => new Request('https://ps.example/api/palermo', { headers: h });

describe('dalSito', () => {
  it('ammette same-origin e navigazione diretta', () => {
    expect(dalSito(r({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
    expect(dalSito(r({ 'Sec-Fetch-Site': 'none' }))).toBe(true);
  });
  it('rifiuta altri siti', () => {
    expect(dalSito(r({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false);
    expect(dalSito(r({ 'Sec-Fetch-Site': 'same-site' }))).toBe(false);
    expect(dalSito(r({ Origin: 'https://altro.it' }))).toBe(false);
    expect(dalSito(r({ Referer: 'https://altro.it/pagina' }))).toBe(false);
  });
  it('ripiego su Origin e Referer se manca Sec-Fetch-Site', () => {
    expect(dalSito(r({ Origin: 'https://ps.example' }))).toBe(true);
    expect(dalSito(r({ Referer: 'https://ps.example/grafici.html' }))).toBe(true);
    expect(dalSito(r({ Referer: 'non un url' }))).toBe(false);
  });
  it('rifiuta chi non manda nessuna intestazione (curl)', () => {
    expect(dalSito(r({}))).toBe(false);
  });
  it('ammette solo le origini in whitelist, anche cross-site', () => {
    const h = { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://palermohub.opendatasicilia.it' };
    expect(dalSito(r(h))).toBe(true);
    expect(dalSito(r({ ...h, Origin: 'https://siciliahub.github.io' }))).toBe(true);
    expect(dalSito(r({ ...h, Origin: 'https://siciliahub.github.io.evil.it' }))).toBe(false);
    expect(dalSito(r({ ...h, Origin: 'https://palermohub.opendatasicilia.it/' }))).toBe(false);
  });
  it('CORS solo per le origini ammesse', () => {
    expect(corsPer(r({ Origin: 'https://siciliahub.github.io' }))['Access-Control-Allow-Origin']).toBe('https://siciliahub.github.io');
    expect(corsPer(r({ Origin: 'https://altro.it' }))).toEqual({});
    expect(corsPer(r({}))).toEqual({});
  });
});
