import type { Codice, Fonte, Lettura } from '../types';
import { conteggi, numero, romaIso } from '../util';

const BASE = 'https://servizionline.provinciaromanafbf.it/palermo/monitorps';
const MAPPA: [Codice, string][] = [
  ['rosso', 'Rossi'], ['arancione', 'Arancioni'], ['azzurro', 'Azzurri'], ['verde', 'Verdi'], ['bianco', 'Bianchi'],
];

// `totaleCodiciGialli` esiste nel JSON ma è il vecchio schema a 4 codici: lo ignoriamo.
export function parseBuccheri(json: string): Lettura[] {
  const d = JSON.parse(json);
  if (!d?.pazientiInAttesa || !d?.pazientiInTrattamento) throw new Error('buccheri: JSON senza sezioni attese (schema cambiato?)');
  const att = d.pazientiInAttesa, tr = d.pazientiInTrattamento;

  const codici: Lettura['codici'] = {};
  for (const [nome, suffisso] of MAPPA) {
    const a = numero(String(att[`totaleCodici${suffisso}`] ?? ''));
    const t = numero(String(tr[`totaleCodici${suffisso}`] ?? ''));
    codici[nome] = conteggi({ attesa: a, trattamento: t, totale: a != null && t != null ? a + t : null });
  }

  const inAttesa = numero(String(att.totalePazienti ?? ''));
  const inTratt = numero(String(tr.totalePazienti ?? ''));

  const [g, m, a] = String(d.data ?? '').split('/').map(Number);
  const [hh, mi, ss] = String(d.ora ?? '').split(':').map(Number);
  const rilevataAlle = g && m && a && hh != null && mi != null ? romaIso(a, m, g, hh, mi, ss ?? 0) : null;

  return [{
    psId: 'buccheri-adulti',
    rilevataAlle,
    codici,
    pazientiTotali: inAttesa != null && inTratt != null ? inAttesa + inTratt : null,
    inAttesa,
    sovraffollamentoPct: numero(d.indicatoreSovraffollamento?.valore),
    // La formula è testo: "b (n° posti letto presidiati in PS) = 13"
    postiTecnici: numero(String(d.indicatoreSovraffollamento?.formula ?? '').match(/posti letto presidiati in PS\)\s*=\s*(\d+)/i)?.[1]),
    permanenza: null,
    tempiMediAttesaMin: null,
  }];
}

export const buccheri: Fonte = {
  id: 'buccheri',
  richieste: [{
    chiave: 'dati',
    url: `${BASE}/ajax/dati-monitor-ps/01/G`,
    method: 'POST',
    headers: { Referer: `${BASE}/portal-view/01/G`, Origin: 'https://servizionline.provinciaromanafbf.it' },
  }],
  parse: ([json]) => parseBuccheri(json!),
};
