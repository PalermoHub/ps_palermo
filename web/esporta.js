// Salva ogni grafico della pagina Analisi come PNG, con logo opendatasicilia e avvertenza.
// Si clona il grafico fuori schermo dentro una "scheda" (testata + titolo + grafico + avvertenza) e la si disegna con html2canvas,
// caricato da CDN solo al primo clic.
(() => {
  const $ = (id) => document.getElementById(id);
  /** sezione → grafico + didascalia con lo stato scelto dall'utente (periodo, misura, presidio), se serve. */
  const GRAFICI = {
    'citta-sez': { box: 'citta', slug: 'pazienti-in-attesa-ultime-ore', cap: () => document.querySelector('#citta-per [aria-pressed=true]')?.textContent },
    'heat-sez': { box: 'heat', slug: 'quando-ce-meno-gente', cap: () => { const s = $('heat-ps'); return s && s.selectedOptions[0] ? `Presidio: ${s.selectedOptions[0].textContent}` : ''; } },
    'attesa-sez': { box: 'attesa', slug: 'chi-aspetta-di-piu', cap: () => document.querySelector('#attesa-modo [aria-pressed=true]')?.textContent },
    'dumbbell-sez': { box: 'dumbbell', slug: 'in-attesa-contro-in-struttura' },
    'percorso-sez': { box: 'percorso', slug: 'dove-sono-i-pazienti' },
    'perm-sez': { box: 'perm', slug: 'chi-resta-piu-a-lungo' },
    'confronto-sez': { box: 'confronto', slug: 'sopra-capacita' },
    'salute-sez': { box: 'salute', slug: 'affidabilita-dei-dati' },
  };
  const AVVISO = 'Dati pubblicati dagli ospedali, raccolti e rielaborati da #opendatasicilia a scopo informativo: possono essere incompleti o in ritardo di qualche minuto. Non è un servizio ufficiale e non sostituisce le indicazioni del personale sanitario. Un valore alto non dice quanto aspetterai tu: dipende dal tuo codice colore. In emergenza chiama il 112.';
  const SITO = 'palermohub.opendatasicilia.it/ps_palermo.html';
  const fData = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };

  let h2c = null;
  const carica = () => h2c || (h2c = new Promise((ok, ko) => {
    if (window.html2canvas) return ok(window.html2canvas);
    const s = document.createElement('script'); s.src = 'vendor/html2canvas/html2canvas.min.js';
    s.onload = () => ok(window.html2canvas); s.onerror = () => { h2c = null; ko(new Error('html2canvas non caricato')); };
    document.head.append(s);
  }));

  /** html2canvas disegna gli SVG inline senza i fogli di stile: si copiano gli stili calcolati sugli elementi. */
  const fissaSvg = (radice) => {
    const PROP = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'];
    radice.querySelectorAll('svg *').forEach((n) => { const c = getComputedStyle(n); PROP.forEach((p) => n.style.setProperty(p, c.getPropertyValue(p))); });
  };

  async function esporta(sez, cfg, btn) {
    const sorgente = $(cfg.box); if (!sorgente || !sorgente.children.length) return;
    const titolo = sez.querySelector('h1,h2')?.textContent ?? '';
    const largo = Math.min(820, Math.max(360, Math.round(sorgente.getBoundingClientRect().width)));
    const scheda = el('div', 'exp');
    scheda.style.width = largo + 48 + 'px';

    const top = el('div', 'exp-top');
    const logo = el('span', 'logo'), img = new Image(); img.src = 'img/opendatasicilia.png'; img.alt = ''; img.width = 40; img.height = 44; logo.append(img);
    const brand = el('div', 'exp-brand'); brand.append(el('strong', null, 'Pronto Soccorso Palermo'), el('small', null, 'un progetto di #opendatasicilia'));
    top.append(logo, brand);

    const corpo = el('div', 'sez');
    corpo.append(el('h2', null, titolo));
    const cap = cfg.cap?.(); if (cap) corpo.append(el('p', 'exp-cap', cap));
    const copia = sorgente.cloneNode(true);
    copia.removeAttribute('id'); copia.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    copia.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    copia.querySelectorAll('.ln-out').forEach((n) => n.remove()); // suggerimento d'uso, inutile in un'immagine
    corpo.append(copia);

    const piede = el('div', 'exp-foot');
    piede.append(el('p', 'exp-av', AVVISO), el('p', 'exp-meta', `${SITO} · immagine creata il ${fData.format(new Date())}`));
    scheda.append(top, corpo, piede);

    const guscio = el('div', 'exp-out'); guscio.append(scheda); document.body.append(guscio);
    const etichetta = btn.textContent; btn.disabled = true; btn.textContent = 'Preparo l’immagine…';
    try {
      const html2canvas = await carica();
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all([img.decode?.().catch(() => {})]);
      fissaSvg(scheda);
      const sfondo = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#eef3f6';
      const canvas = await html2canvas(scheda, { backgroundColor: sfondo, scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)), useCORS: true, logging: false });
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('PNG vuoto');
      const nome = `ps-palermo-${cfg.slug}-${new Date().toISOString().slice(0, 10)}.png`;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      btn.textContent = 'Immagine salvata'; setTimeout(() => { btn.textContent = etichetta; }, 2500);
    } catch (e) {
      btn.textContent = 'Non riesco a creare l’immagine'; setTimeout(() => { btn.textContent = etichetta; }, 3500);
    } finally { guscio.remove(); btn.disabled = false; }
  }

  Object.entries(GRAFICI).forEach(([id, cfg]) => {
    const sez = $(id); if (!sez) return;
    const riga = el('div', 'exp-r'), b = el('button', 'exp-b', 'Salva come immagine PNG'); b.type = 'button';
    b.setAttribute('aria-label', `Salva il grafico «${sez.querySelector('h1,h2')?.textContent ?? ''}» come immagine PNG`);
    b.addEventListener('click', () => esporta(sez, cfg, b));
    riga.append(b); sez.append(riga);
  });
})();
