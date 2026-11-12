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
  nav.append(cond);
  const main = document.querySelector('main');
  main.insertBefore(nav, main.firstChild);
  // il menu deve stare nello stesso contenitore del contenuto
  if (!sei) { nav.style.paddingTop = '0'; }

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
