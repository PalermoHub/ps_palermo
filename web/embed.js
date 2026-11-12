// Modalità embed: navigazione interna, altezza automatica e tema in dialogo con la pagina ospitante.
// Messaggi verso il genitore: {source:'ps-palermo', type:'height', height} · {…, type:'scroll', y}
// Messaggi dal genitore: {source:'ps-palermo', type:'tema', value:'light'|'dark'}
(() => {
  const H = document.documentElement;
  if (!H.classList.contains('embed')) return;
  const invia = m => { try { parent.postMessage({ source: 'ps-palermo', ...m }, '*'); } catch (e) {} };

  const sei = /grafici/.test(location.pathname);
  const nav = document.createElement('nav');
  nav.className = 'emb-nav'; nav.setAttribute('aria-label', 'Sezioni');
  nav.innerHTML = `<a href="./"${sei ? '' : ' aria-current="page"'}>Mappa e presidi</a><a href="grafici.html"${sei ? ' aria-current="page"' : ''}>Grafici</a>`
;
  // condividi: porta alla pagina PalermoHub (la home, o i grafici con #grafici)
  const cond = document.createElement('button');
  cond.type = 'button'; cond.className = 'emb-sh'; cond.title = 'Condividi'; cond.setAttribute('aria-label', 'Condividi');
  cond.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3"/></svg><span class="emb-ok" role="status"></span>';
  const ok = cond.querySelector('.emb-ok');
  cond.addEventListener('click', async () => {
    const url = 'https://palermohub.opendatasicilia.it/ps_palermo.html' + (sei ? '#grafici' : '');
    const copia = async () => { try { await navigator.clipboard.writeText(url); ok.textContent = 'Link copiato'; setTimeout(() => (ok.textContent = ''), 2000); } catch { prompt('Copia il link', url); } };
    if (!navigator.share) return copia();
    try { await navigator.share({ title: document.title, url }); } catch (e) { if (e.name !== 'AbortError') copia(); }
  });
  const gd = document.createElement('button');
  gd.type = 'button'; gd.className = 'emb-sh'; gd.title = 'Guida'; gd.setAttribute('aria-label', 'Apri la guida'); gd.setAttribute('data-guida', '');
  gd.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4.2M12 17.6v.1"/></svg>';
  // tema: il pulsante dell'intestazione è nascosto in embed, quindi lo si comanda da qui (la logica resta quella dell'app).
  // Segue `data-theme` anche quando a cambiarlo è la pagina ospitante. La scelta vale per la sessione: i link Mappa/Grafici ricaricano l'iframe.
  const ICT = { luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>', sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>' };
  const svgT = (d, n) => `<svg viewBox="0 0 24 24" width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const scuro = () => H.dataset.theme === 'dark';
  const alterna = () => {
    const b = document.getElementById('tema');
    if (b) b.click(); else H.dataset.theme = scuro() ? 'light' : 'dark';
    try { sessionStorage.setItem('tema-embed', H.dataset.theme); } catch (e) {}
  };
  const tm = document.createElement('button');
  tm.type = 'button'; tm.className = 'emb-sh'; tm.addEventListener('click', alterna);
  const aggiornaTema = () => {
    const eti = scuro() ? 'Passa al tema chiaro' : 'Passa al tema scuro';
    tm.innerHTML = svgT(scuro() ? ICT.sole : ICT.luna, 20); tm.title = eti; tm.setAttribute('aria-label', eti);
    if (tmB) { tmB.innerHTML = svgT(scuro() ? ICT.sole : ICT.luna, 22) + '<span>Tema</span>'; tmB.setAttribute('aria-label', eti); }
  };
  let tmB = null;
  nav.append(gd, tm, cond);
  const main = document.querySelector('main');
  main.insertBefore(nav, main.firstChild);
  // il menu deve stare nello stesso contenitore del contenuto
  if (!sei) { nav.style.paddingTop = '0'; }

  // mobile: la barra in basso prende Guida e Condividi (al posto di "Vicino a me"); i pulsanti in alto sono nascosti da embed.css
  const bn = document.querySelector('.bnav');
  if (bn) {
    const ic = d => `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    bn.querySelector('#bn-vicino, a[href*="vicino"]')?.remove();
    const bg = document.createElement('button');
    bg.type = 'button'; bg.setAttribute('data-guida', ''); bg.setAttribute('aria-label', 'Apri la guida');
    bg.innerHTML = ic('<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4.2M12 17.6v.1"/>') + '<span>Guida</span>';
    const bc = document.createElement('button');
    bc.type = 'button'; bc.setAttribute('aria-label', 'Condividi');
    bc.innerHTML = ic('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3"/>') + '<span>Condividi</span>';
    bc.addEventListener('click', () => cond.click());
    new MutationObserver(() => { bc.lastChild.textContent = ok.textContent || 'Condividi'; }).observe(ok, { childList: true, characterData: true, subtree: true });
    tmB = document.createElement('button');
    tmB.type = 'button'; tmB.addEventListener('click', alterna);
    bn.append(bg, tmB, bc);
  }
  aggiornaTema();
  new MutationObserver(aggiornaTema).observe(H, { attributes: true, attributeFilter: ['data-theme'] });

  // la guida (dialog) esiste solo nella home: dai grafici si passa lì con ?guida=1
  if (!document.getElementById('guida')) document.addEventListener('click', e => { if (e.target.closest('[data-guida]')) location.href = './?guida=1'; });

  // link che escono dall'app: nuova scheda, mai dentro l'iframe
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="http"]');
    if (a && !a.target && new URL(a.href).origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener'; }
  }, true);

  // altezza: il genitore ridimensiona l'iframe, così non ci sono due barre di scorrimento
  let ult = 0;
  const altezza = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h && h !== ult) { ult = h; invia({ type: 'height', height: h }); }
  };
  new ResizeObserver(altezza).observe(document.body);
  addEventListener('load', altezza);
  addEventListener('message', e => {
    const d = e.data;
    if (d && d.source === 'ps-palermo' && d.type === 'tema' && (d.value === 'light' || d.value === 'dark')) H.dataset.theme = d.value;
    if (d && d.source === 'ps-palermo' && d.type === 'rimisura') { ult = 0; altezza(); }
  });

  // scheda aperta: chiedi al genitore di portare in vista l'inizio dell'iframe
  const sch = document.getElementById('scheda');
  if (sch) new MutationObserver(() => { if (sch.open) invia({ type: 'scroll', y: Math.max(0, sch.getBoundingClientRect().top - 12) }); }).observe(sch, { attributes: true, attributeFilter: ['open'] });
})();
