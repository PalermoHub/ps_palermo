import { parse } from 'node-html-parser';
import type { Fonte, Lettura } from '../types';
import { CODICE_DA_NOME, conteggi, dataOraNumerica, numero, sommaOnesta, testo } from '../util';

const URL = 'https://www.asppalermo.org/attese_ps/index_mod2.php';
const SOLO_PALERMO_CITTA: Record<string, string> = { 'PRONTO SOCCORSO - INGRASSIA DI PALERMO': 'ingrassia-adulti' };

/** La pagina ASP elenca tutti i PS della provincia; teniamo solo quelli in anagrafica. */
export function parseAsp(html: string): Lettura[] {
  const pezzi = html.split(/<h5[^>]*nome-presidio[^>]*>/i).slice(1);
  if (pezzi.length === 0) throw new Error('asp: nessun presidio trovato (layout cambiato?)');

  const out: Lettura[] = [];
  for (const pezzo of pezzi) {
    const titolo = testo(pezzo.split('</h5>')[0]);
    const psId = SOLO_PALERMO_CITTA[titolo];
    if (!psId) continue;
    const blocco = parse(pezzo);
    const info = testo(blocco.querySelector('.alert-dark')?.text);

    const intest = blocco.querySelectorAll('thead th').map((th) => CODICE_DA_NOME[testo(th.text).toLowerCase()]);
    const righe: Record<string, (number | null)[]> = {};
    for (const tr of blocco.querySelectorAll('tbody tr')) {
      const etichetta = testo(tr.querySelector('th')?.text).toLowerCase();
      righe[etichetta] = tr.querySelectorAll('td').map((td) => numero(td.text));
    }
    const riga = (prefisso: string) => Object.entries(righe).find(([k]) => k.startsWith(prefisso))?.[1] ?? [];
    const attesa = riga('attesa'), tratt = riga('trattam'), oss = riga('osserv'), tot = riga('totale');

    const codici: Lettura['codici'] = {};
    // intest[0] è la cella del nome presidio: le colonne dati partono da intest[1].
    intest.slice(1).forEach((nome, k) => {
      if (nome) codici[nome] = conteggi({ attesa: attesa[k] ?? null, trattamento: tratt[k] ?? null, osservazione: oss[k] ?? null, totale: tot[k] ?? null });
    });

    out.push({
      psId,
      rilevataAlle: dataOraNumerica(info.match(/Aggiornato al:\s*([\d/]+\s*-\s*[\d:]+)/i)?.[1] ?? ''),
      codici,
      pazientiTotali: numero(testo(blocco.querySelector('tbody tr:last-child th')?.text).match(/Totale n\.\s*(\d+)/i)?.[1]),
      inAttesa: sommaOnesta(attesa),
      sovraffollamentoPct: numero(info.match(/Indice di Sovraffollamento:\s*([\d.,]+)/i)?.[1]),
      postiTecnici: numero(info.match(/Posti tecnici presidiati:\s*(\d+)/i)?.[1]),
      permanenza: null,
      tempiMediAttesaMin: null,
    });
  }
  return out;
}

export const asp: Fonte = {
  id: 'asp',
  richieste: [{ chiave: 'pagina', url: URL }],
  parse: ([html]) => parseAsp(html!),
};
