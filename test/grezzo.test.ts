import { describe, expect, it, vi } from 'vitest';
import { aggiorna, type FetchFn } from '../src/aggiorna';
import { archivia, comprimi, decomprimi, leggi, pota, type Cattura } from '../src/grezzo';
import { FONTI } from '../src/registry';
import { d1Finto } from './d1';
import { fx } from './fx';

const risposte: Record<string, string> = {
  'ospedaliriunitipalermo.it': fx('riuniti.html'),
  'arnascivico.it': fx('civico.html'),
  'asppalermo.org': fx('asp.html'),
  'provinciaromanafbf.it': fx('buccheri.json'),
  'ProntoSoccorsoIndici': fx('policlinico-indici.json'),
  'ProntoSoccorso': fx('policlinico.json'),
};
const ok: FetchFn = async (url) => new Response(risposte[Object.keys(risposte).find((x) => url.includes(x))!]);
const T0 = new Date('2026-11-12T10:00:00Z');

describe('cattura delle risposte originali', () => {
  it('aggiorna() raccoglie ogni risposta, una per richiesta (6 con le 2 del Policlinico)', async () => {
    const c: Cattura[] = [];
    await aggiorna(null, FONTI, ok, T0, c);
    expect(c).toHaveLength(6);
    expect(c.every((x) => x.esito === 'ok' && x.corpo)).toBe(true);
    expect(c.find((x) => x.fonte === 'asp')!.corpo).toBe(fx('asp.html'));
  });
  it('errore di rete: cattura senza corpo; errore di parser: corpo conservato con esito parse', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c: Cattura[] = [];
    const f: FetchFn = async (url) => (url.includes('asppalermo') ? new Response('x', { status: 500 }) : url.includes('arnascivico') ? new Response('<html>cambiato</html>') : ok(url));
    await aggiorna(null, FONTI, f, T0, c);
    const asp = c.find((x) => x.fonte === 'asp')!;
    expect(asp.corpo).toBeNull();
    expect(asp.esito).toMatch(/^rete: .*HTTP 500/);
    const civ = c.find((x) => x.fonte === 'civico')!;
    expect(civ.corpo).toBe('<html>cambiato</html>');
    expect(civ.esito).toMatch(/^parse: civico/);
  });
  it('senza il parametro catture non cambia nulla (compatibilità)', async () => {
    const s = await aggiorna(null, FONTI, ok, T0);
    expect(Object.values(s.ps).filter((p) => p.lettura)).toHaveLength(8);
  });
});

describe('archivio (SQLite reale, migrazione vera)', () => {
  const nuovoDb = () => d1Finto(['0002_grezzo.sql']);
  const cat = (corpo: string | null, esito = 'ok'): Cattura => ({ fonte: 'asp', chiave: 'pagina', corpo, esito });

  it('gzip: andata e ritorno, anche con accenti', async () => {
    const s = 'Pronto Soccorso è più «veloce» — 😀'.repeat(50);
    const z = await comprimi(s);
    expect(z.length).toBeLessThan(new TextEncoder().encode(s).length);
    expect(await decomprimi(z)).toBe(s);
  });
  it('salva, deduplica per hash e rilegge il corpo identico', async () => {
    const db = nuovoDb();
    expect(await archivia(db, [cat('<p>uno</p>')], T0)).toBe(1);
    expect(await archivia(db, [cat('<p>uno</p>')], new Date(T0.getTime() + 120_000))).toBe(0); // invariato
    expect(await archivia(db, [cat('<p>due</p>')], new Date(T0.getTime() + 240_000))).toBe(1);
    const { results } = await db.prepare('SELECT id FROM grezzo ORDER BY id').all<{ id: number }>();
    expect(results).toHaveLength(2);
    const r = await leggi(db, results[0]!.id);
    expect(r).toMatchObject({ fonte: 'asp', chiave: 'pagina', esito: 'ok', corpo: '<p>uno</p>' });
  });
  it('torna al corpo di prima dopo uno diverso: viene salvato di nuovo (dedup solo con l\'ultimo)', async () => {
    const db = nuovoDb();
    await archivia(db, [cat('A')], T0); await archivia(db, [cat('B')], T0); 
    expect(await archivia(db, [cat('A')], T0)).toBe(1);
  });
  it('errori di rete ripetuti identici non gonfiano l\'archivio', async () => {
    const db = nuovoDb();
    expect(await archivia(db, [cat(null, 'rete: HTTP 522')], T0)).toBe(1);
    expect(await archivia(db, [cat(null, 'rete: HTTP 522')], T0)).toBe(0);
    expect(await archivia(db, [cat(null, 'rete: timeout')], T0)).toBe(1);
  });
  it('potatura: dopo 7 giorni resta il primo campione del giorno; gli errori restano 90 giorni', async () => {
    const db = nuovoDb();
    const giorno = (n: number, h: number) => new Date(T0.getTime() - n * 86400_000 + h * 3600_000);
    await archivia(db, [cat('g10-a')], giorno(10, 0));
    await archivia(db, [cat('g10-b')], giorno(10, 1));
    await archivia(db, [cat('g1-a')], giorno(1, 0));
    await archivia(db, [cat(null, 'rete: vecchio')], giorno(20, 0));
    await pota(db, T0);
    const { results } = await db.prepare('SELECT esito FROM grezzo ORDER BY id').all<{ esito: string }>();
    const corpi = [];
    for (let i = 1; i <= 4; i++) corpi.push((await leggi(db, i))?.corpo ?? null);
    expect(corpi).toEqual(['g10-a', null, 'g1-a', null]); // 4° = errore senza corpo
    expect(results.map((r) => r.esito)).toEqual(['ok', 'ok', 'rete: vecchio']);
  });
});
