const COD = ['rosso', 'arancione', 'azzurro', 'verde', 'bianco'];
const ETI = { rosso: 'Rosso', arancione: 'Arancio', azzurro: 'Azzurro', verde: 'Verde', bianco: 'Bianco' };
const ORDINI = [['attesa', 'Più in attesa'], ['sov', 'Meno affollati'], ['nome', 'Nome']];
const FILTRI = [['tutti', 'Tutti'], ['adulti', 'Adulti'], ['pediatrico', 'Pediatrici']];

const st = { dati: null, filtro: 'tutti', ordine: 'attesa', vista: 'card', q: '', pos: null };
/** Riquadro della provincia di Palermo [sud-ovest, nord-est]: la mappa non può uscirne. */
const PROVINCIA = [[37.6, 12.85], [38.3, 14.1]];
let puntiMappa = [], mappa = null, strato = null, marcatori = [], miniMappa = null, ultimiIds = '';

const $ = (id) => document.getElementById(id);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };
const nd = (v) => (v == null ? '–' : v);

function fmtMin(m) {
  if (m == null) return null;
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`;
}
function eta(iso) {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return { min, txt: min < 1 ? 'adesso' : min < 60 ? `${min} min fa` : `${Math.floor(min / 60)} h fa` };
}
function km(a, b) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function livello(sov) {
  if (sov == null) return { k: 'nd', txt: 'Dato non disponibile' };
  if (sov < 120) return { k: 'ok', txt: 'Poco affollato' };
  if (sov < 200) return { k: 'mid', txt: 'Affollato' };
  return { k: 'bad', txt: 'Molto affollato' };
}
/** Quando è stato letto il dato: l'ora dichiarata dall'ospedale, se c'è, altrimenti quella della nostra lettura. */
function freschezza(p) {
  const l = p.lettura;
  const e = eta(l?.rilevataAlle) ?? eta(p.acquisitaAlle);
  if (!e) return { txt: 'Orario non disponibile', vecchio: false };
  return { txt: `${l?.rilevataAlle ? 'Rilevato' : 'Letto'} ${e.txt}`, vecchio: e.min > 30 };
}
function badge(p, menoId) {
  const lv = livello(p.lettura?.sovraffollamentoPct);
  return p.id === menoId ? { k: 'ok', txt: 'Meno affollato' } : lv;
}
function menoAffollato() {
  let best = null;
  for (const p of st.dati.ps) {
    const s = p.lettura?.sovraffollamentoPct;
    if (s != null && (!best || s < best.s)) best = { id: p.id, s, nome: p.nome };
  }
  return best;
}

function visibili() {
  const q = st.q.trim().toLowerCase();
  let ps = st.dati.ps.filter((p) => (st.filtro === 'tutti' || p.tipo === st.filtro) && (!q || `${p.nome} ${p.struttura}`.toLowerCase().includes(q)));
  const att = (p) => p.lettura?.inAttesa ?? -1;
  const sov = (p) => p.lettura?.sovraffollamentoPct ?? Infinity;
  if (st.pos) ps.sort((a, b) => km(st.pos, a.coords) - km(st.pos, b.coords));
  else if (st.ordine === 'attesa') ps.sort((a, b) => att(b) - att(a));
  else if (st.ordine === 'sov') ps.sort((a, b) => sov(a) - sov(b));
  else ps.sort((a, b) => a.nome.localeCompare(b.nome));
  return ps;
}

/* ---------- riepilogo ---------- */
function renderStats() {
  const ps = st.dati.ps, con = ps.filter((p) => p.lettura);
  const attesa = con.reduce((s, p) => s + (p.lettura.inAttesa ?? 0), 0);
  const aff = con.filter((p) => (p.lettura.sovraffollamentoPct ?? 0) >= 120).length;
  const meno = menoAffollato();
  const box = $('stats'); box.replaceChildren();
  const p1 = el('div', 'plate sole');
  p1.append(el('span', 'pl-k', 'In attesa adesso'), el('b', null, attesa), el('span', 'pl-t', `persone nei pronto soccorso · ${aff} presidi su ${con.length} affollati`));
  box.append(p1);
  if (meno) {
    const p2 = el('button', 'plate verde'); p2.type = 'button';
    const t = el('div'); t.append(el('span', 'pl-k', 'Meno affollato adesso'), el('div', 'pl-t', meno.nome));
    p2.append(el('span', 'pct', Math.round(meno.s) + '%'), t);
    p2.insertAdjacentHTML('beforeend', '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>');
    p2.setAttribute('aria-label', `Apri la scheda di ${meno.nome}, il meno affollato adesso, ${Math.round(meno.s)} per cento`);
    p2.addEventListener('click', () => apriScheda(meno.id));
    box.append(p2);
  }
  const a = eta(st.dati.aggiornatoAlle);
  $('sub').textContent = `Dati in tempo reale · sito aggiornato ${a ? a.txt : '—'} · ${con.length}/${ps.length} pronto soccorso con dati`;
}

/* ---------- mappa ---------- */
/** Mappa di base: stili vettoriali OpenFreeMap (chiaro/scuro), senza chiavi API. Se WebGL manca, ripiego su OpenStreetMap raster. */
const IC = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h4.5v-6h4v6h4.5V10"/>',
  piu: '<path d="M12 5v14M5 12h14"/>', meno: '<path d="M5 12h14"/>',
  gps: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', esci: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  share: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
};
const icona = (k) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const STILI = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
const ATTR = '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> dati <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const basi = [];
const tema = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function aggiungiBase(m) {
  let l = null;
  try { if (L.maplibreGL && window.maplibregl?.supported?.() !== false) l = L.maplibreGL({ style: STILI[tema()], attribution: ATTR }).addTo(m); } catch { l = null; }
  if (!l) {
    m.getContainer().classList.add('raster');
    l = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
  }
  basi.push({ m, l });
  m.once('unload', () => { const k = basi.findIndex((b) => b.m === m); if (k >= 0) basi.splice(k, 1); });
}
function impostaTema(t, salva) {
  document.documentElement.dataset.theme = t;
  if (salva) try { localStorage.setItem('tema', t); } catch {}
  basi.forEach(({ l }) => l.getMaplibreMap?.()?.setStyle(STILI[t]));
  document.querySelectorAll('.mc-tema').forEach((b) => { b.innerHTML = icona(t === 'dark' ? 'sole' : 'luna'); b.title = b.ariaLabel = t === 'dark' ? 'Tema chiaro' : 'Tema scuro'; });
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#06141f' : '#0b3a5a');
}
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', (e) => { let s = null; try { s = localStorage.getItem('tema'); } catch {} if (!s) impostaTema(e.matches ? 'dark' : 'light'); });
$('tema')?.addEventListener('click', () => impostaTema(tema() === 'dark' ? 'light' : 'dark', true));
impostaTema(tema());
if ($('condividi')) $('condividi').innerHTML = icona('share');
$('condividi')?.addEventListener('click', async (e) => {
  const b = e.currentTarget, url = location.origin + location.pathname;
  try { if (navigator.share) await navigator.share({ title: document.title, url }); else { await navigator.clipboard.writeText(url); b.title = 'Link copiato'; setTimeout(() => (b.title = 'Condividi'), 2000); } } catch {}
});

const COL = { rosso: '#d62b2b', arancione: '#f08a1c', azzurro: '#2fa7d8', verde: '#2f9e5b', bianco: '#e2dfd9' };
/** Pin tondo: l'anello è diviso nei codici colore in proporzione ai pazienti, al centro il totale in attesa. */
function pin(p, menoId) {
  const l = p.lettura, lv = badge(p, menoId).k, cls = lv === 'nd' ? '' : lv;
  const v = COD.map((c) => [c, l?.codici[c]?.attesa ?? 0]), tot = v.reduce((s, x) => s + x[1], 0);
  let acc = 0, stops = [];
  for (const [c, n] of v) if (n > 0) { const a0 = (acc / tot) * 360; acc += n; stops.push(`${COL[c]} ${a0}deg ${(acc / tot) * 360}deg`); }
  const ring = tot ? `conic-gradient(${stops.join(',')})` : '#bdbab4';
  const html = `<div class="pin ${cls}" style="background:${ring}"><span>${nd(l?.inAttesa)}</span></div>`;
  return L.divIcon({ className: '', iconSize: [52, 52], iconAnchor: [26, 26], html });
}
/** Due presidi nello stesso punto (es. Cervello adulti e pediatrico) si sposterebbero uno sull'altro: li distanzio. */
function coordsMappa(ps) {
  const visti = new Map();
  return ps.map((p) => {
    const key = `${p.coords.lat.toFixed(3)},${p.coords.lng.toFixed(3)}`, n = visti.get(key) ?? 0;
    visti.set(key, n + 1);
    return [p.coords.lat + n * 0.0007, p.coords.lng + n * 0.0007];
  });
}
/** Colonna di pulsanti tondi sulla mappa: centra, zoom, posizione, schermo intero. */
function controlliMappa(m, cont) {
  const Ctl = L.Control.extend({ onAdd() {
    const box = L.DomUtil.create('div', 'mc');
    L.DomEvent.disableClickPropagation(box);
    const btn = (k, label, fn) => {
      const b = L.DomUtil.create('button', 'mc-b', box); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = icona(k);
      b.addEventListener('click', (e) => fn(b, e)); return b;
    };
    btn('home', 'Centra sugli ospedali', () => centra());
    btn('piu', 'Ingrandisci', () => m.zoomIn());
    btn('meno', 'Riduci', () => m.zoomOut());
    btn('gps', 'La mia posizione', (b) => navigator.geolocation?.getCurrentPosition(
      (g) => { st.pos = { lat: g.coords.latitude, lng: g.coords.longitude }; $('vicino')?.setAttribute('aria-pressed', 'true'); renderLista(); m.setView([st.pos.lat, st.pos.lng], Math.max(m.getZoom(), 14)); },
      () => alert('Posizione non disponibile. Controlla i permessi del browser.')));
    btn('full', 'Schermo intero', (b) => {
      if (document.fullscreenElement) document.exitFullscreen(); else cont.requestFullscreen?.();
    });
    document.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === cont, f = box.children[4];
      f.innerHTML = icona(on ? 'esci' : 'full'); f.title = f.ariaLabel = on ? 'Esci da schermo intero' : 'Schermo intero';
      m.invalidateSize();
    });
    return box;
  } });
  new Ctl({ position: 'topleft' }).addTo(m);
  impostaTema(tema());
}
function renderMappa(ps, refit) {
  const m = $('map');
  if (!window.L) { if (!m.firstChild) m.append(el('p', 'nomap', 'La mappa non è disponibile al momento. Le schede qui sotto mostrano gli stessi dati.')); return; }
  if (!mappa) {
    mappa = L.map(m, { zoomControl: false, scrollWheelZoom: false, maxBounds: PROVINCIA, maxBoundsViscosity: 1, zoomSnap: 0.5 }).setView([38.12, 13.36], 12);
    mappa.setMinZoom(mappa.getBoundsZoom(PROVINCIA));
    aggiungiBase(mappa);
    strato = L.layerGroup().addTo(mappa);
    mappa.on('zoomend', distanzia);
    mappa.on('resize', () => { mappa.setMinZoom(mappa.getBoundsZoom(PROVINCIA)); centra(); });
    controlliMappa(mappa, m);
    mappa.on('popupopen', () => marcatori.forEach((x) => x.mk.closeTooltip()));
  }
  strato.clearLayers(); marcatori = [];
  const meno = menoAffollato()?.id, cc = coordsMappa(ps), punti = [];
  ps.forEach((p, i) => {
    const mk = L.marker(cc[i], { icon: pin(p, meno), keyboard: true, alt: `${p.nome}: ${p.lettura?.inAttesa ?? 'nessun dato'} in attesa` , zIndexOffset: p.lettura?.inAttesa ?? 0 }).addTo(strato);
    const pop = el('div', 'pop'), b = el('button', null, 'Apri la scheda');
    pop.append(el('h3', null, p.nome), el('p', null, `${nd(p.lettura?.inAttesa)} in attesa · ${badge(p, meno).txt}`));
    if (p.lettura) { const g = el('div', 'cod'); COD.forEach((c) => g.append(chip(p.lettura, c))); pop.append(g); }
    pop.append(b);
    b.type = 'button'; b.addEventListener('click', () => apriScheda(p.id));
    mk.bindPopup(pop, { minWidth: 260, maxWidth: 260, offset: [0, -22], autoPanPaddingTopLeft: [20, 70], autoPanPaddingBottomRight: [20, 20] });
    const tip = el('div', 'tip');
    tip.append(el('strong', null, p.nome), el('span', null, `${nd(p.lettura?.inAttesa)} in attesa · ${badge(p, meno).txt}`));
    if (p.lettura) { const g = el('div', 'cod'); COD.forEach((c) => g.append(chip(p.lettura, c))); tip.append(g); }
    mk.bindTooltip(tip, { direction: 'top', offset: [0, -24], opacity: 1, className: 'ps-tip' });
    mk.on('mouseover', () => {
      const pt = mappa.latLngToContainerPoint(mk.getLatLng()), sz = mappa.getSize(), t = mk.getTooltip();
      const d = pt.x < 135 ? 'right' : pt.x > sz.x - 135 ? 'left' : pt.y < 140 ? 'bottom' : 'top';
      if (t.options.direction === d) return;
      t.options.direction = d;
      t.options.offset = d === 'top' ? [0, -24] : d === 'bottom' ? [0, 24] : d === 'right' ? [26, 0] : [-26, 0];
      mk.closeTooltip(); mk.openTooltip();
    });
    marcatori.push({ mk, base: cc[i] });
    punti.push(cc[i]);
  });
  if (st.pos) { L.marker([st.pos.lat, st.pos.lng], { icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="pin me"></div>' }), title: 'La tua posizione', interactive: false }).addTo(strato); punti.push([st.pos.lat, st.pos.lng]); }
  puntiMappa = punti;
  if (refit) centra();
  distanzia();
}
/** Inquadra tutti i presidi (e la posizione dell'utente, se nota), restando dentro i confini della provincia. */
function centra() {
  if (!mappa || !puntiMappa.length) return;
  mappa.fitBounds(puntiMappa, { paddingTopLeft: [85, 55], paddingBottomRight: [85, 45], maxZoom: 14 });
}
/** Le etichette larghe si coprirebbero: le sposto solo in visualizzazione, in pixel, finché non si toccano. */
function distanzia() {
  if (!mappa) return;
  const W = 54, H = 54, pt = marcatori.map((m) => mappa.latLngToContainerPoint(m.base));
  for (let it = 0; it < 60; it++) {
    let mosso = false;
    for (let i = 0; i < pt.length; i++) for (let j = i + 1; j < pt.length; j++) {
      const dx = pt[j].x - pt[i].x, dy = pt[j].y - pt[i].y, ox = W - Math.abs(dx), oy = H - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      mosso = true;
      if (oy <= ox) { const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5); pt[i].y -= s; pt[j].y += s; }
      else { const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5); pt[i].x -= s; pt[j].x += s; }
    }
    if (!mosso) break;
  }
  marcatori.forEach((m, i) => m.mk.setLatLng(mappa.containerPointToLatLng(pt[i])));
}

/* ---------- lista ---------- */
function barra(l) {
  const lv = livello(l?.sovraffollamentoPct), s = l?.sovraffollamentoPct;
  const wrap = el('div');
  const lab = el('div', 'bar-l'); lab.append(el('span', null, 'Sovraffollamento'), el('span', null, s == null ? '–' : Math.round(s) + '%'));
  const bar = el('div', 'bar'), fill = el('i', lv.k);
  fill.style.width = (s == null ? 0 : Math.min(100, Math.round(s / 2))) + '%';
  bar.append(fill, el('u'));
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', s == null ? 'Sovraffollamento non disponibile' : `Sovraffollamento ${Math.round(s)} per cento; il segno indica il 100 per cento`);
  const sc = el('div', 'bar-s'); sc.append(el('span', null, '0'), el('span', null, '100%'), el('span', null, '200%+'));
  wrap.append(lab, bar, sc); return wrap;
}
function chip(l, c) {
  const v = l?.codici[c]?.attesa, d = el('div', `c-${c}${v == null ? ' nd' : ''}`);
  const lab = el('span', null, ETI[c]); lab.prepend(el('i'));
  d.append(el('b', null, nd(v)), lab); return d;
}
function tempiTesto(l) {
  const t = l?.tempiMediAttesaMin;
  const parti = t ? COD.filter((c) => t[c] != null).map((c) => `${c} ${fmtMin(t[c])}`) : [];
  return parti.length ? parti.join(' · ') : null;
}

function card(p, menoId) {
  const l = p.lettura, b = badge(p, menoId), art = el('article', 'card lv-' + b.k);
  const head = el('div', 'card-h'), tit = el('div');
  tit.append(el('h3', null, p.nome), el('p', null, `${p.struttura} · ${p.tipo === 'adulti' ? 'adulti' : 'pediatrico'}${st.pos ? ` · ${km(st.pos, p.coords).toFixed(1)} km` : ''}`));
  head.append(tit, el('span', `badge ${b.k}`, b.txt)); art.append(head);
  if (!l) { art.append(el('p', 'err', 'Dati non disponibili al momento.')); }
  else {
    const num = el('div', 'num'), a = el('div'), t = el('div');
    a.append(el('b', null, nd(l.inAttesa)), el('small', null, 'in attesa'));
    t.append(el('b', null, nd(l.pazientiTotali)), el('small', null, 'in struttura'));
    num.append(a, t); art.append(num, barra(l));
    const g = el('div', 'cod'); COD.forEach((c) => g.append(chip(l, c))); art.append(g);
    const tm = tempiTesto(l);
    if (tm) { const pp = el('p', 'tempi'); pp.append(el('strong', null, 'Attesa media: '), tm); art.append(pp); }
  }
  const f = freschezza(p), foot = el('div', 'card-f');
  foot.append(el('span', f.vecchio ? 'vecchio' : null, p.ultimoErrore && l ? `${f.txt} · fonte non raggiungibile` : f.txt));
  const btn = el('button', 'btn', 'Scheda completa'); btn.type = 'button'; btn.addEventListener('click', () => apriScheda(p.id));
  foot.append(btn); art.append(foot);
  return art;
}

function tabella(ps, menoId) {
  const w = el('div', 'tw'), t = el('table');
  t.append(el('caption', 'vh', 'Pronto soccorso di Palermo: pazienti in attesa per codice colore'));
  const hr = el('tr');
  ['Presidio', 'Sovraff.', 'Rosso', 'Arancio', 'Azzurro', 'Verde', 'Bianco', 'In attesa'].forEach((h) => { const th = el('th', null, h); th.scope = 'col'; hr.append(th); });
  const th = el('thead'); th.append(hr); t.append(th);
  const tb = el('tbody');
  for (const p of ps) {
    const l = p.lettura, tr = el('tr'), b = badge(p, menoId), h = el('th'), lk = el('button', 'lk', p.nome);
    h.scope = 'row'; lk.type = 'button'; lk.addEventListener('click', () => apriScheda(p.id));
    h.append(lk, el('small', null, p.tipo === 'adulti' ? 'adulti' : 'pediatrico'));
    const s = el('td'); s.append(el('span', `badge ${b.k}`, l?.sovraffollamentoPct == null ? '–' : Math.round(l.sovraffollamentoPct) + '%'));
    tr.append(h, s);
    COD.forEach((c) => tr.append(el('td', null, nd(l?.codici[c]?.attesa))));
    tr.append(el('td', null, nd(l?.inAttesa))); tb.append(tr);
  }
  t.append(tb); w.append(t); return w;
}

function renderLista() {
  const ps = visibili(), meno = menoAffollato()?.id, box = $('lista'); box.replaceChildren();
  if (!ps.length) box.append(el('p', 'vuoto', 'Nessun pronto soccorso corrisponde alla ricerca.'));
  else if (st.vista === 'tab') box.append(tabella(ps, meno));
  else { const g = el('div', 'griglia'); ps.forEach((p) => g.append(card(p, meno))); box.append(g); }
  const ids = ps.map((p) => p.id).join();
  renderMappa(ps, ids !== ultimiIds); ultimiIds = ids;
}

/* ---------- scheda del presidio ---------- */
function sezione(titolo) { const s = el('section', 's-sec'); s.append(el('h3', null, titolo)); return s; }
const somma = (l, k) => { const v = COD.map((c) => l.codici[c]?.[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
function righe(box, voci) {
  voci.filter(([, v]) => v != null).forEach(([lab, v]) => { const r = el('div', 's-r'); r.append(el('span', null, lab), el('b', null, v)); box.append(r); });
}
function info(icona, nodo) { const r = el('div', 's-i'); r.append(el('span', 's-ic', icona), nodo); return r; }
function link(txt, href) { const a = el('a', null, txt); a.href = href; if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; } return a; }
function azione(txt, href, primaria) { const a = link(txt, href); a.className = 'btn' + (primaria ? '' : ' sec'); return a; }

function apriScheda(id, daHash) {
  const p = st.dati?.ps.find((x) => x.id === id);
  if (!p) return;
  const l = p.lettura, meno = menoAffollato()?.id, b = badge(p, meno), corpo = $('s-corpo'), f = freschezza(p);
  corpo.replaceChildren();
  const c = `${p.coords.lat},${p.coords.lng}`;

  // Intestazione: nome, chip di stato, struttura, azioni rapide.
  const h = el('div', 's-h'), h2 = el('h2', null, p.nome); h2.id = 's-titolo';
  const x = el('button', 's-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Chiudi la scheda'); x.addEventListener('click', () => $('scheda').close());
  h.append(h2, x); corpo.append(h);
  const chips = el('div', 's-chips');
  chips.append(el('span', `badge ${b.k}`, b.txt), el('span', 'badge nd', p.tipo === 'adulti' ? 'Adulti' : 'Pediatrico'));
  if (p.id === meno && b.txt !== 'Meno affollato') chips.append(el('span', 'badge ok', 'Meno affollato'));
  corpo.append(chips, el('p', 'dove', p.struttura));
  const az = el('div', 's-az');
  az.append(azione('Indicazioni', `https://www.google.com/maps/dir/?api=1&destination=${c}`, true));
  if (p.telefono) az.append(azione('Chiama', `tel:${p.telefono.replace(/\s/g, '')}`));
  if (p.sito) az.append(azione('Sito', p.sito));
  const sh = el('button', 'btn sec', 'Condividi'); sh.type = 'button';
  sh.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#ps=${encodeURIComponent(p.id)}`;
    try { if (navigator.share) await navigator.share({ title: `Pronto soccorso ${p.nome}`, url }); else { await navigator.clipboard.writeText(url); sh.textContent = 'Link copiato'; setTimeout(() => (sh.textContent = 'Condividi'), 2000); } } catch {}
  });
  az.append(sh); corpo.append(az);

  const griglia = el('div', 's-grid'), sx = el('div', 's-col'), dx = el('div', 's-col');

  // Fascia in alto: i numeri che contano, con il termometro del sovraffollamento.
  const cur = el('section', 's-hero'), top = el('div', 's-top');
  top.append(el('h3', null, 'Situazione attuale'), el('span', `live${f.vecchio ? ' vecchio' : ''}`, f.txt));
  cur.append(top);
  if (!l) cur.append(el('p', 'err', 'Dati non disponibili al momento.'));
  else {
    const big = el('div', 's-big');
    [[l.inAttesa, 'pazienti in attesa'], [l.pazientiTotali, 'pazienti in struttura'], [l.sovraffollamentoPct == null ? null : Math.round(l.sovraffollamentoPct) + '%', 'sovraffollamento', b.k]]
      .filter(([v]) => v != null).forEach(([v, lab, k]) => { const d = el('div'); d.append(el('b', k, v), el('span', null, lab)); big.append(d); });
    cur.append(big);
    if (l.sovraffollamentoPct != null) cur.append(barra(l));
  }
  corpo.append(cur);

  // Colonna sinistra: tabella per codice colore e mappa.
  if (l) {
    const cols = [['attesa', 'In attesa di visita'], ['trattamento', 'In trattamento'], ['osservazione', 'In osservazione'], ['totale', 'Totali']]
      .filter(([k]) => COD.some((cd) => l.codici[cd]?.[k] != null));
    const box = el('section', 's-box'); box.append(el('h3', null, 'Per codice colore'));
    const tw = el('div', 'tw'), t = el('table', 's-t'), hr = el('tr');
    ['Codice', ...cols.map((k) => k[1])].forEach((n) => { const th = el('th', null, n); th.scope = 'col'; hr.append(th); });
    const thd = el('thead'); thd.append(hr); t.append(thd);
    const tb = el('tbody');
    COD.forEach((cd) => {
      const tr = el('tr'), th = el('th'), sw = el('span', 'sw'); th.scope = 'row';
      sw.style.background = cd === 'bianco' ? '#fff' : `var(--${cd})`;
      th.append(sw, cd === 'arancione' ? 'Arancione' : ETI[cd]); tr.append(th);
      cols.forEach(([k]) => tr.append(el('td', 'n', nd(l.codici[cd]?.[k]))));
      tb.append(tr);
    });
    const tot = el('tr', 's-tot'), tth = el('th', null, 'Totale'); tth.scope = 'row'; tot.append(tth);
    cols.forEach(([k]) => tot.append(el('td', 'n', k === 'totale' ? '–' : nd(somma(l, k)))));
    tb.append(tot);
    t.append(tb); tw.append(t); box.append(tw);
    if (cols.length === 1) box.append(el('p', 's-nota', 'Questo ospedale pubblica solo i pazienti in attesa per codice.'));
    sx.append(box);
  }
  const dove = el('section', 's-box'); dove.append(el('h3', null, 'Mappa'));
  const mm = el('div'); mm.id = 's-map'; mm.setAttribute('role', 'region'); mm.setAttribute('aria-label', `Posizione di ${p.nome}`); dove.append(mm);

  // Colonna destra: dati a gruppi (piastrelle) e informazioni.
  if (l) {
    const perm = l.permanenza, tm = l.tempiMediAttesaMin;
    const pres = el('section', 's-box'); pres.append(el('h3', null, 'Presenze'));
    righe(pres, [['In trattamento', somma(l, 'trattamento')], ['In osservazione', somma(l, 'osservazione')], ['Posti tecnici presidiati', l.postiTecnici]]);
    if (pres.children.length > 1) dx.append(pres);
    const tiles = (tit, voci, cls) => {
      const v = voci.filter(([, x]) => x != null); if (!v.length) return;
      const bx = el('section', 's-box'); bx.append(el('h3', null, tit));
      const g = el('div', `s-tiles ${cls || ''}`);
      v.forEach(([lab, x, col]) => { const d = el('div'); if (col) d.style.setProperty('--tc', col); d.append(el('b', null, x), el('span', null, lab)); g.append(d); });
      bx.append(g); dx.append(bx);
    };
    tiles('Tempo in struttura', [['meno di 24 ore', perm?.meno24h], ['24–48 ore', perm?.da24a48h], ['oltre 48 ore', perm?.oltre48h]]);
    if (tm) tiles('Attesa media', COD.filter((cd) => tm[cd] != null).map((cd) => [cd === 'arancione' ? 'Arancione' : ETI[cd], fmtMin(tm[cd]), cd === 'bianco' ? 'var(--ctl)' : `var(--${cd})`]), 'col');
  }
  const inf = el('section', 's-box'); inf.append(el('h3', null, 'Informazioni'));
  inf.append(info('📍', link(p.indirizzo, `https://www.google.com/maps/search/?api=1&query=${c}`)));
  if (p.telefono) inf.append(info('📞', link(p.telefono, `tel:${p.telefono.replace(/\s/g, '')}`)));
  if (p.sito) inf.append(info('🌐', link(p.sito.replace(/^https?:\/\/(www\.)?/, ''), p.sito)));
  inf.append(info('📄', link('Pagina ufficiale della fonte', p.fonteUrl)));
  if (p.ultimoErrore) inf.append(el('p', 'err', 'La fonte non è raggiungibile: si vede l’ultimo dato valido.'));
  sx.append(inf);
  dx.append(dove);

  griglia.append(sx, dx); corpo.append(griglia);
  const nota = el('p', 's-avviso'); nota.append('I dati sono pubblicati dal pronto soccorso e potrebbero non essere sempre accurati o aggiornati. In caso di emergenza chiama il ', el('strong', null, '112'), '.');
  corpo.append(nota);

  const dlg = $('scheda');
  if (!dlg.open) dlg.showModal();
  dlg.dataset.id = id;
  if (!daHash) history.replaceState(null, '', `#ps=${encodeURIComponent(id)}`);
  // La mini-mappa si crea dopo che la scheda è visibile, altrimenti Leaflet misura un contenitore vuoto.
  if (window.L) {
    if (miniMappa) { miniMappa.remove(); miniMappa = null; }
    miniMappa = L.map(mm, { scrollWheelZoom: false }).setView([p.coords.lat, p.coords.lng], 16);
    aggiungiBase(miniMappa);
    L.marker([p.coords.lat, p.coords.lng], { title: p.nome }).addTo(miniMappa);
  } else mm.append(el('p', 'nomap', 'Mappa non disponibile.'));
  dlg.scrollTop = 0;
}

$('scheda').addEventListener('close', () => {
  if (miniMappa) { miniMappa.remove(); miniMappa = null; }
  if (location.hash.startsWith('#ps=')) history.replaceState(null, '', location.pathname + location.search);
});
$('scheda').addEventListener('click', (e) => { if (e.target === $('scheda')) $('scheda').close(); });

/* ---------- controlli ---------- */
function toggles(cont, voci, chiave, cls, conta) {
  const box = $(cont); box.replaceChildren();
  for (const [id, lab] of voci) {
    const b = el('button', cls); b.type = 'button'; b.setAttribute('aria-pressed', String(st[chiave] === id));
    b.append(lab);
    if (conta) b.append(' ', el('small', null, String(st.dati.ps.filter((p) => id === 'tutti' || p.tipo === id).length)));
    b.addEventListener('click', () => { st[chiave] = id; if (chiave === 'ordine') { st.pos = null; $('vicino').setAttribute('aria-pressed', 'false'); } controlli(); renderLista(); });
    box.append(b);
  }
}
function controlli() {
  toggles('filtri', FILTRI, 'filtro', 'pill', true);
  toggles('ordini', ORDINI, 'ordine', 'chip');
  toggles('viste', [['card', 'Schede'], ['tab', 'Tabella']], 'vista', 'chip');
}
$('cerca').addEventListener('input', (e) => { st.q = e.target.value; renderLista(); });
$('vicino').addEventListener('click', (e) => {
  if (st.pos) { st.pos = null; e.currentTarget.setAttribute('aria-pressed', 'false'); return renderLista(); }
  const btn = e.currentTarget;
  navigator.geolocation?.getCurrentPosition(
    (g) => { st.pos = { lat: g.coords.latitude, lng: g.coords.longitude }; btn.setAttribute('aria-pressed', 'true'); renderLista(); },
    () => alert('Posizione non disponibile. Controlla i permessi del browser.'));
});

/* ---------- avvio ---------- */
function mostra(d) {
  st.dati = d; renderStats(); controlli(); renderLista();
  const m = location.hash.match(/^#ps=(.+)$/);
  if (m && !$('scheda').open) apriScheda(decodeURIComponent(m[1]), true);
}
fetch('/api/palermo').then((r) => r.json()).then(mostra)
  .catch(() => { $('sub').textContent = 'Impossibile caricare i dati. Riprova tra poco.'; });
// Aggiorna da solo ogni 2 minuti, senza ricaricare la pagina né chiudere la scheda aperta.
setInterval(() => fetch('/api/palermo').then((r) => r.json()).then((d) => {
  const aperta = $('scheda').open ? $('scheda').dataset.id : null;
  st.dati = d; renderStats(); renderLista();
  if (aperta && $('scheda').open) { const y = $('scheda').scrollTop; apriScheda(aperta, true); $('scheda').scrollTop = y; }
}).catch(() => {}), 120000);

/* ---------- barra in basso (mobile) ---------- */
$('bn-vicino')?.addEventListener('click', () => {
  $('presidi').scrollIntoView({ behavior: 'smooth' });
  if (!st.pos) $('vicino').click();
});
const bnVoci = [...document.querySelectorAll('.bnav [data-v]')], bnMappa = document.querySelector('.bnav [data-s=mappa]');
let sezVista = 'mappa';
function bnAggiorna() {
  bnMappa?.classList.toggle('on', sezVista === 'mappa');
  bnVoci.forEach((b) => b.classList.toggle('on', sezVista === 'presidi' && b.dataset.v === st.vista));
}
bnVoci.forEach((b) => b.addEventListener('click', () => {
  st.vista = b.dataset.v; controlli(); renderLista(); sezVista = 'presidi'; bnAggiorna();
  $('presidi').scrollIntoView({ behavior: 'smooth' });
}));
try {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { sezVista = e.target.id; bnAggiorna(); } }), { rootMargin: '-45% 0px -50% 0px' });
  ['mappa', 'presidi'].forEach((id) => $(id) && io.observe($(id)));
} catch {}
document.addEventListener('click', (e) => { if (e.target.closest('#viste')) setTimeout(bnAggiorna, 0); });
