import { describe, expect, it } from 'vitest';
import { parseAsp } from '../src/sources/asp';
import { parseCivico } from '../src/sources/civico';
import { parsePoliclinico } from '../src/sources/policlinico';
import { parseRiuniti } from '../src/sources/riuniti';
import { fx } from './fx';

/**
 * Se una fonte cambia layout il parser deve FALLIRE (così il Worker conserva l'ultima lettura buona e lo segnala),
 * non restituire numeri inventati o zeri. Un test per ogni fonte.
 */
describe('layout cambiato: errore esplicito, mai dati falsi', () => {
  it('Civico: pagina senza il marcatore', () => expect(() => parseCivico('<html><body>manutenzione</body></html>')).toThrow(/layout cambiato/));
  it('Civico: pagina vuota', () => expect(() => parseCivico('')).toThrow());
  it('ASP: nessun presidio', () => expect(() => parseAsp('<html></html>')).toThrow(/layout cambiato/));
  it('Riuniti: nessun blocco presidio', () => expect(() => parseRiuniti('<html></html>')).toThrow(/layout cambiato/));
  it('Policlinico: JSON con schema diverso', () => {
    expect(() => parsePoliclinico('{}', '{}')).toThrow(/schema cambiato/);
    expect(() => parsePoliclinico('[]', '[]')).toThrow(/schema cambiato/);
  });
  it('Policlinico: risposta HTML al posto del JSON (pagina di errore o blocco)', () => {
    expect(() => parsePoliclinico('<html>Accesso negato</html>', '{}')).toThrow();
  });
  it('Policlinico: indici mancanti non fanno cadere il parser, i campi restano null', () => {
    const [l] = parsePoliclinico(fx('policlinico.json'), '{}');
    expect(l!.postiTecnici).toBeNull();
    expect(l!.sovraffollamentoPct).toBeNull(); // niente posti, niente indice inventato
    expect(l!.permanenza).toEqual({ meno24h: null, da24a48h: null, oltre48h: null });
    expect(l!.inAttesa).not.toBeNull();
  });
});
