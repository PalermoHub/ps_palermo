import { parse } from 'node-html-parser';
import type { Fonte, Lettura } from '../types';
import { CODICE_DA_NOME, conteggi, dataOraMeseEsteso, numero, testo } from '../util';

const URL = 'https://www.ospedaliriunitipalermo.it/amministrazione-trasparente/servizi-erogati/liste-di-attesa/pazienti-in-attesa-al-pronto-soccorso/';

const ID: Record<string, string> = {
  'cervello|adulti': 'cervello-adulti',
  'villa sofia|adulti': 'villa-sofia-adulti',
  'cervello|pediatrico': 'cervello-pediatrico',
};

/** Selettori per classe (non posizionali): reggono a riordini del layout. I codici qui sono pazienti IN ATTESA. */
export function parseRiuniti(html: string): Lettura[] {
  const root = parse(html);
  const rilevataAlle = dataOraMeseEsteso(testo(root.querySelector('.olo-row-dati-aggiornati-al')?.text));
  const blocchi = root.querySelectorAll('.olo-container-single-hospital');
  if (blocchi.length === 0) throw new Error('riuniti: nessun blocco presidio trovato (layout cambiato?)');

  const out: Lettura[] = [];
  for (const b of blocchi) {
    const presidio = testo(b.querySelector('.olo-title-hospital')?.text).replace(/^presidio\s+/i, '').toLowerCase();
    const sezione = testo(b.querySelector('.olo-sezione-pronto-soccorso')?.text).toLowerCase();
    const tipo = sezione.includes('pediatric') ? 'pediatrico' : 'adulti';
    const psId = ID[`${presidio}|${tipo}`];
    if (!psId) continue;

    const codici: Lettura['codici'] = {};
    for (const c of b.querySelectorAll('.olo-container-codice')) {
      const nome = CODICE_DA_NOME[testo(c.querySelector('.olo-title-codice')?.text).toLowerCase()];
      if (nome) codici[nome] = conteggi({ attesa: numero(c.querySelector('.olo-number-codice')?.text) });
    }

    // Pagina rigenerata a metà (blocchi presenti ma vuoti): meglio un errore che un "OK" senza numeri.
    if (Object.keys(codici).length === 0) throw new Error(`riuniti: blocco "${presidio} ${tipo}" senza codici (pagina in aggiornamento?)`);

    // Righe "Dettagli": coppie etichetta/valore in <div><span label/><span valore/></div>
    const dettagli = new Map<string, number | null>();
    for (const d of b.querySelectorAll('.olo-row-altri-indicatori > div')) {
      const spans = d.querySelectorAll('span');
      const label = spans.find((s) => s.classList.contains('olo-label-indicatore'));
      const valore = spans.find((s) => !s.classList.contains('olo-label-indicatore') && !s.classList.value.some((c) => c.startsWith('olo-')));
      if (label && valore) dettagli.set(testo(label.text), numero(valore.text));
    }
    const per = (inizia: string) => [...dettagli].find(([k]) => k.startsWith(inizia))?.[1] ?? null;

    // Il blocco pediatrico non ha le classi .tot/.wait: ci si affida all'etichetta di testo.
    const perEtichetta = (inizia: string) => {
      const box = b.querySelectorAll('.olo-container-blue').find((x) => testo(x.querySelector('.olo-title-pazienti')?.text).toLowerCase().startsWith(inizia));
      return numero(box?.querySelector('.olo-number-pazienti')?.text);
    };

    out.push({
      psId,
      rilevataAlle,
      codici,
      pazientiTotali: perEtichetta('tot'),
      inAttesa: perEtichetta('di cui in attesa'),
      sovraffollamentoPct: numero(b.querySelector('.olo-row-indice-sovraffollamento span')?.text),
      postiTecnici: per('Posti tecnici'),
      permanenza: { meno24h: per('K1'), da24a48h: per('K2'), oltre48h: per('K3') },
      tempiMediAttesaMin: null,
    });
  }
  return out;
}

export const riuniti: Fonte = {
  id: 'riuniti',
  richieste: [{ chiave: 'pagina', url: URL }],
  parse: ([html]) => parseRiuniti(html!),
};
