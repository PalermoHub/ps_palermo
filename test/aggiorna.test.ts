import { describe, expect, it, vi } from 'vitest';
import { aggiorna, type FetchFn } from '../src/aggiorna';
import { FONTI } from '../src/registry';
import { fx } from './fx';

const risposte: Record<string, string> = {
  'ospedaliriunitipalermo.it': fx('riuniti.html'),
  'arnascivico.it': fx('civico.html'),
  'asppalermo.org': fx('asp.html'),
  'provinciaromanafbf.it': fx('buccheri.json'),
  'ProntoSoccorsoIndici': fx('policlinico-indici.json'),
  'ProntoSoccorso': fx('policlinico.json'),
};
const ok: FetchFn = async (url) => {
  const k = Object.keys(risposte).find((x) => url.includes(x))!;
  return new Response(risposte[k]);
};

describe('aggiorna', () => {
  it('popola tutti gli 8 PS', async () => {
    const s = await aggiorna(null, FONTI, ok, new Date('2026-11-11T18:30:00Z'));
    const letti = Object.values(s.ps).filter((p) => p.lettura);
    expect(letti).toHaveLength(8);
    expect(letti.every((p) => p.ultimoErrore === null)).toBe(true);
  });

  it('se una fonte cade, tiene l\'ultima lettura buona e registra l\'errore', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const prima = await aggiorna(null, FONTI, ok, new Date('2026-11-11T18:30:00Z'));
    const rotta: FetchFn = async (url) => (url.includes('asppalermo') ? new Response('boom', { status: 500 }) : ok(url));
    const dopo = await aggiorna(prima, FONTI, rotta, new Date('2026-11-11T18:32:00Z'));
    const ing = dopo.ps['ingrassia-adulti']!;
    expect(ing.lettura).not.toBeNull(); // dato vecchio ancora presente
    expect(ing.acquisitaAlle).toBe('2026-11-11T18:30:00.000Z'); // con la sua età vera
    expect(ing.ultimoErrore).toMatch(/asp: HTTP 500/);
    expect(dopo.ps['civico-adulti']!.ultimoErrore).toBeNull(); // le altre fonti non sono toccate
  });
});
