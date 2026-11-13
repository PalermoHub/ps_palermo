import { describe, expect, it } from 'vitest';
import { dalSito } from '../src/origine';

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
});
