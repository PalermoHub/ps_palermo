import type { Codice, Fonte, Lettura } from '../types';
import { conteggi, durataMin, numero, sommaOnesta } from '../util';

const API = 'https://www.policlinico.pa.it/o/PoliclinicoPaRestBuilder/v1.0';
const HEADERS = { Referer: 'https://www.policlinico.pa.it/web/guest', Origin: 'https://www.policlinico.pa.it' };
const MAPPA: [Codice, string][] = [
  ['rosso', 'Rosso (1)'], ['arancione', 'Arancione (2)'], ['azzurro', 'Azzurro (3)'], ['verde', 'Verde (4)'], ['bianco', 'Bianco (5)'],
];

/**
 * ASSUNZIONE DA VERIFICARE: `pazientiInCarico` = pazienti in trattamento. Il JSON non dice altro e
 * non pubblica un orario di rilevazione (rilevataAlle = null: mostrare solo l'ora della nostra lettura).
 */
export function parsePoliclinico(principale: string, indici: string): Lettura[] {
  const d = JSON.parse(principale);
  const ix = JSON.parse(indici);
  if (!d?.pazientiInAttesa) throw new Error('policlinico: JSON senza pazientiInAttesa (schema cambiato?)');

  const codici: Lettura['codici'] = {};
  const tempi: Partial<Record<Codice, number>> = {};
  for (const [nome, chiave] of MAPPA) {
    const a = numero(String(d.pazientiInAttesa?.[chiave] ?? ''));
    const t = numero(String(d.pazientiInCarico?.[chiave] ?? ''));
    codici[nome] = conteggi({ attesa: a, trattamento: t, totale: a != null && t != null ? a + t : null });
    const min = durataMin(String(d.tempiMediAttesa?.[chiave] ?? ''));
    if (min != null) tempi[nome] = min;
  }

  const m24 = numero(ix?.permanenza24H), m2448 = numero(ix?.permanenza2448H), oltre = numero(ix?.permanenzaOltre24H);
  const posti = numero(ix?.postiTecniciPresidiati);
  const nPerm = (m24 ?? 0) + (m2448 ?? 0) + (oltre ?? 0);
  const inAttesa = sommaOnesta(Object.values(codici).map((c) => c.attesa));
  const inTratt = sommaOnesta(Object.values(codici).map((c) => c.trattamento));

  return [{
    psId: 'policlinico-adulti',
    rilevataAlle: null,
    codici,
    pazientiTotali: inAttesa != null && inTratt != null ? inAttesa + inTratt : null,
    inAttesa,
    // Stessa formula del repo originale: (permanenze / posti tecnici) x 100. NON pubblicato dall'ospedale.
    sovraffollamentoCalcolato: true,
    sovraffollamentoPct: posti ? Math.round((nPerm / posti) * 10000) / 100 : null,
    postiTecnici: posti,
    permanenza: { meno24h: m24, da24a48h: m2448, oltre48h: oltre },
    tempiMediAttesaMin: Object.keys(tempi).length ? tempi : null,
  }];
}

export const policlinico: Fonte = {
  id: 'policlinico',
  richieste: [
    { chiave: 'principale', url: `${API}/ProntoSoccorso`, headers: HEADERS },
    { chiave: 'indici', url: `${API}/ProntoSoccorsoIndici`, headers: HEADERS },
  ],
  parse: ([p, i]) => parsePoliclinico(p!, i!),
};
