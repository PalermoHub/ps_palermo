import { describe, expect, it } from 'vitest';
import { parseAsp } from '../src/sources/asp';
import { parseBuccheri } from '../src/sources/buccheri';
import { parseCivico } from '../src/sources/civico';
import { parsePoliclinico } from '../src/sources/policlinico';
import { parseRiuniti } from '../src/sources/riuniti';
import { fx } from './fx';

const per = <T extends { psId: string }>(l: T[], id: string) => l.find((x) => x.psId === id)!;

describe('Ospedali Riuniti', () => {
  const l = parseRiuniti(fx('riuniti.html'));
  it('trova i 3 PS', () => expect(l.map((x) => x.psId).sort()).toEqual(['cervello-adulti', 'cervello-pediatrico', 'villa-sofia-adulti']));
  it('Cervello adulti', () => {
    const c = per(l, 'cervello-adulti');
    expect(c.rilevataAlle).toBe('2026-11-11T19:16:00+01:00');
    expect(c.pazientiTotali).toBe(53);
    expect(c.inAttesa).toBe(15);
    expect(c.codici.arancione?.attesa).toBe(3);
    expect(c.codici.azzurro?.attesa).toBe(5);
    expect(c.codici.verde?.attesa).toBe(7);
    expect(c.codici.arancione?.trattamento).toBeNull(); // la fonte non lo pubblica: null, non 0
    expect(c.sovraffollamentoPct).toBe(177);
    expect(c.postiTecnici).toBe(30);
    expect(c.permanenza).toEqual({ meno24h: 33, da24a48h: 13, oltre48h: 7 });
  });
  it('i codici in attesa sommano al totale in attesa (coerenza)', () => {
    for (const x of l) {
      const somma = Object.values(x.codici).reduce((s, c) => s + (c.attesa ?? 0), 0);
      expect(somma).toBe(x.inAttesa);
    }
  });
  it('blocchi presenti ma vuoti (pagina rigenerata a metà) -> errore, non dati nulli', () => {
    const vuota = '<div class="olo-row-dati-aggiornati-al">Situazione aggiornata al 11 Novembre 2026 19:41</div>' +
      '<div class="olo-container-single-hospital cervello"><h3 class="olo-title-hospital">Presidio Cervello</h3><div class="olo-sezione-pronto-soccorso">Pronto Soccorso Adulti</div></div>';
    expect(() => parseRiuniti(vuota)).toThrow(/senza codici/);
  });
  it('fallisce in modo esplicito se il layout cambia', () => {
    expect(() => parseRiuniti('<html><body>nulla</body></html>')).toThrow(/layout cambiato/);
  });
});

describe('ARNAS Civico', () => {
  const l = parseCivico(fx('civico.html'));
  it('adulti', () => {
    const c = per(l, 'civico-adulti');
    expect(c.rilevataAlle).toMatch(/^2026-11-11T19:24:34\+01:00$/);
    expect(c.pazientiTotali).toBe(84);
    expect(c.sovraffollamentoPct).toBe(200);
    expect(c.postiTecnici).toBe(42);
    expect(c.permanenza).toEqual({ meno24h: 71, da24a48h: 9, oltre48h: 4 });
    expect(c.codici.azzurro).toEqual({ attesa: 23, trattamento: 6, osservazione: 12, totale: 41 });
    expect(c.codici.bianco).toBeUndefined(); // la tabella non ha il bianco
    expect(c.inAttesa).toBe(48);
  });
  it('pediatrico (Di Cristina)', () => {
    const c = per(l, 'di-cristina-pediatrico');
    expect(c.pazientiTotali).toBe(36);
    expect(c.sovraffollamentoPct).toBe(218);
    expect(c.postiTecnici).toBe(16);
    expect(c.codici.verde?.totale).toBe(15);
  });
  it('la somma dei totali di riga coincide col totale pazienti', () => {
    for (const x of l) {
      const somma = Object.values(x.codici).reduce((s, c) => s + (c.totale ?? 0), 0);
      expect(somma).toBe(x.pazientiTotali);
    }
  });
});

describe('ASP Ingrassia', () => {
  const l = parseAsp(fx('asp.html'));
  it('tiene solo Ingrassia (gli altri sono fuori città)', () => expect(l.map((x) => x.psId)).toEqual(['ingrassia-adulti']));
  it('valori', () => {
    const c = l[0]!;
    expect(c.rilevataAlle).toBe('2026-11-11T19:21:57+01:00');
    expect(c.postiTecnici).toBe(13);
    expect(c.sovraffollamentoPct).toBe(261.54);
    expect(c.pazientiTotali).toBe(34);
    expect(c.codici.azzurro).toEqual({ attesa: 9, trattamento: 4, osservazione: 2, totale: 15 });
    expect(c.inAttesa).toBe(13);
  });
});

describe('Buccheri La Ferla', () => {
  const [c] = parseBuccheri(fx('buccheri.json'));
  it('valori', () => {
    expect(c!.rilevataAlle).toBe('2026-11-11T19:22:40+01:00');
    expect(c!.inAttesa).toBe(16);
    expect(c!.pazientiTotali).toBe(36);
    expect(c!.sovraffollamentoPct).toBe(277);
    expect(c!.postiTecnici).toBe(13);
    expect(c!.codici.azzurro).toEqual({ attesa: 7, trattamento: 9, osservazione: null, totale: 16 });
    expect(c!.codici.arancione?.trattamento).toBe(6);
  });
  it('schema cambiato -> errore', () => expect(() => parseBuccheri('{}')).toThrow(/schema cambiato/));
});

describe('Policlinico', () => {
  const [c] = parsePoliclinico(fx('policlinico.json'), fx('policlinico-indici.json'));
  it('valori', () => {
    expect(c!.rilevataAlle).toBeNull();
    expect(c!.codici.arancione).toEqual({ attesa: 4, trattamento: 13, osservazione: null, totale: 17 });
    expect(c!.inAttesa).toBe(15);
    expect(c!.postiTecnici).toBe(25);
    expect(c!.permanenza).toEqual({ meno24h: 33, da24a48h: 7, oltre48h: 8 });
    expect(c!.sovraffollamentoPct).toBe(192); // (33+7+8)/25
  });
  it('tempi medi in minuti', () => {
    expect(c!.tempiMediAttesaMin).toEqual({ rosso: 22, arancione: 145, azzurro: 207, verde: 130, bianco: 180 });
  });
});

describe('dato mancante non diventa zero', () => {
  it('Buccheri: totalePazienti assente -> null, non 0', () => {
    const j = JSON.parse(fx('buccheri.json'));
    delete j.pazientiInAttesa.totalePazienti;
    const [b] = parseBuccheri(JSON.stringify(j));
    expect(b!.inAttesa).toBeNull();
    expect(b!.pazientiTotali).toBeNull();
  });
  it('Policlinico: «in carico» assente per un codice -> totale null, non parziale', () => {
    const j = JSON.parse(fx('policlinico.json'));
    delete j.pazientiInCarico['Rosso (1)'];
    const [p] = parsePoliclinico(JSON.stringify(j), fx('policlinico-indici.json'));
    expect(p!.pazientiTotali).toBeNull();
    expect(p!.inAttesa).not.toBeNull(); // le attese restano complete
  });
});
