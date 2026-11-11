import { parse } from 'node-html-parser';
import type { Codice, Fonte, Lettura } from '../types';
import { CODICE_DA_NOME, conteggi, dataOraNumerica, numero, testo } from '../util';

const URL = 'https://www.arnascivico.it/index.php?option=com_content&view=article&id=3415&catid=24&Itemid=139';

/** Pagina Joomla: due blocchi (adulti poi pediatrico), ciascuno con testo libero + tabella `gridtable`. */
export function parseCivico(html: string): Lettura[] {
  // L'HTML dell'intera pagina Joomla ha markup che confonde il parser (0 tabelle trovate): isoliamo il frammento utile.
  const da = html.search(/Situazione aggiornata al/i);
  if (da < 0) throw new Error('civico: marcatore "Situazione aggiornata" non trovato (layout cambiato?)');
  const fine = html.indexOf('Nel Pronto Soccorso con metodi codificati', da);
  // Sorgente malformato: <th> chiusa con </td> e <tbody> mai chiuso fanno annidare la seconda tabella nella prima.
  html = html.slice(da, fine > da ? fine : undefined).replace(/(<th\b[^>]*>[^<]*)<\/td>/gi, '$1</th>');
  if (!/<\/tbody>/i.test(html)) html = html.replace(/<\/table>/gi, '</tbody></table>');
  const root = parse(html);
  const rilevataAlle = dataOraNumerica(html.match(/Situazione aggiornata al\s*([^<]+)/i)?.[1] ?? '');
  const tabelle = root.querySelectorAll('table.gridtable');
  if (tabelle.length !== 2) throw new Error(`civico: attese 2 tabelle, trovate ${tabelle.length} (layout cambiato?)`);

  // Testo piatto, spezzato nei due blocchi dai titoli "Totale pazienti al P.S. ..."
  const piatto = testo(html.replace(/<(?=\d)/g, '&lt;').replace(/<br\s*\/?>/gi, ' ').replace(/<table[\s\S]*?<\/table>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  const iAd = piatto.search(/Totale pazienti al P\.S\. Civico/i);
  const iPe = piatto.search(/Totale pazienti al P\.S\. Pediatrico/i);
  if (iAd < 0 || iPe < 0) throw new Error('civico: titoli dei blocchi non trovati');
  const testi = [piatto.slice(iAd, iPe), piatto.slice(iPe)];
  const ids = ['civico-adulti', 'di-cristina-pediatrico'];

  return tabelle.map((tab, i) => {
    const t = testi[i]!;
    const codici: Lettura['codici'] = {};
    for (const tr of tab.querySelectorAll('tr')) {
      const celle = tr.querySelectorAll('td');
      if (celle.length < 4) continue; // salta intestazione e riga "Totale" (th)
      const nome = CODICE_DA_NOME[testo(celle[0]!.text).toLowerCase()] as Codice | undefined;
      if (!nome) continue;
      codici[nome] = conteggi({
        attesa: numero(celle[1]!.text), trattamento: numero(celle[2]!.text),
        osservazione: numero(celle[3]!.text), totale: numero(celle[4]?.text),
      });
    }
    const estrai = (re: RegExp) => numero(t.match(re)?.[1]);
    return {
      psId: ids[i]!,
      rilevataAlle,
      codici,
      pazientiTotali: estrai(/Totale pazienti al P\.S\.[^:]*:\s*(\d+)/i),
      inAttesa: Object.values(codici).reduce((s, c) => s + (c.attesa ?? 0), 0),
      sovraffollamentoPct: estrai(/Indice Sovraffollamento:\s*([\d.,]+)\s*%/i),
      postiTecnici: estrai(/posti tecnici presidiati[^:]*:\s*(\d+)/i),
      permanenza: {
        meno24h: estrai(/permanenza\s*<\s*24h:\s*(\d+)/i),
        da24a48h: estrai(/compresa tra 24h e 48h:\s*(\d+)/i),
        oltre48h: estrai(/permanenza\s*>\s*48h:\s*(\d+)/i),
      },
      tempiMediAttesaMin: null,
    } satisfies Lettura;
  });
}

export const civico: Fonte = {
  id: 'civico',
  richieste: [{ chiave: 'pagina', url: URL }],
  parse: ([html]) => parseCivico(html!),
};
