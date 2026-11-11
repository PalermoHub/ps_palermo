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
  const add = (valore, small, lab, cls) => {
    const d = el('div', 'stat'), b = el('b', cls, valore);
    if (small) b.append(' ', el('small', null, small));
    d.append(b, el('span', null, lab)); box.append(d);
  };
  add(attesa, null, 'persone in attesa ora');
  add(aff, `su ${con.length}`, 'presidi affollati o molto affollati');
  if (meno) add(meno.nome, null, `il meno affollato adesso · ${Math.round(meno.s)}%`, 't');
  const a = eta(st.dati.aggiornatoAlle);
  $('sub').textContent = `Dati in tempo reale · sito aggiornato ${a ? a.txt : '—'} · ${con.length}/${ps.length} pronto soccorso con dati`;
}

/* ---------- mappa ---------- */
/** Mappa di base: stili vettoriali OpenFreeMap (chiaro/scuro), senza chiavi API. Se WebGL manca, ripiego su OpenStreetMap raster. */
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
  const b = $('tema'); if (b) b.setAttribute('aria-pressed', String(t === 'dark'));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0c0c0b' : '#1a1a1a');
}
$('tema')?.addEventListener('click', () => impostaTema(tema() === 'dark' ? 'light' : 'dark', true));
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', (e) => { let s = null; try { s = localStorage.getItem('tema'); } catch {} if (!s) impostaTema(e.matches ? 'dark' : 'light'); });
impostaTema(tema());

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
function renderMappa(ps, refit) {
  const m = $('map');
  if (!window.L) { if (!m.firstChild) m.append(el('p', 'nomap', 'La mappa non è disponibile al momento. Le schede qui sotto mostrano gli stessi dati.')); return; }
  if (!mappa) {
    mappa = L.map(m, { scrollWheelZoom: false, maxBounds: PROVINCIA, maxBoundsViscosity: 1, zoomSnap: 0.5 }).setView([38.12, 13.36], 12);
    mappa.setMinZoom(mappa.getBoundsZoom(PROVINCIA));
    aggiungiBase(mappa);
    strato = L.layerGroup().addTo(mappa);
    mappa.on('zoomend', distanzia);
    mappa.on('resize', () => { mappa.setMinZoom(mappa.getBoundsZoom(PROVINCIA)); centra(); });
    const Ctl = L.Control.extend({ onAdd() {
      const b = L.DomUtil.create('button', 'leaflet-bar centra'); b.type = 'button'; b.textContent = 'Centra sugli ospedali';
      L.DomEvent.disableClickPropagation(b); b.addEventListener('click', () => centra()); return b;
    } });
    new Ctl({ position: 'topright' }).addTo(mappa);
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
  const l = p.lettura, art = el('article', 'card'), b = badge(p, menoId);
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

  // Colonna sinistra: situazione attuale.
  const cur = el('section', 's-box'), top = el('div', 's-top');
  top.append(el('h3', null, 'Situazione attuale'), el('span', `live${f.vecchio ? ' vecchio' : ''}`, f.txt));
  cur.append(top);
  if (!l) cur.append(el('p', 'err', 'Dati non disponibili al momento.'));
  else {
    const big = el('div', 's-big');
    [[l.inAttesa, 'pazienti in attesa'], [l.sovraffollamentoPct == null ? null : Math.round(l.sovraffollamentoPct) + '%', 'indice di sovraffollamento', b.k]]
      .filter(([v]) => v != null).forEach(([v, lab, k]) => { const d = el('div'); d.append(el('b', k, v), el('span', null, lab)); big.append(d); });
    cur.append(big, barra(l));

    const cols = [['attesa', 'In attesa di visita'], ['trattamento', 'In trattamento'], ['osservazione', 'In osservazione'], ['totale', 'Totali']]
      .filter(([k]) => COD.some((cd) => l.codici[cd]?.[k] != null));
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
    t.append(tb); tw.append(t); cur.append(tw);
    if (cols.length === 1) cur.append(el('p', 's-nota', 'Questo ospedale pubblica solo i pazienti in attesa per codice.'));
  }
  sx.append(cur);

  // Colonna destra: altri dati, informazioni, mappa.
  if (l) {
    const perm = l.permanenza, tm = l.tempiMediAttesaMin;
    const box = el('section', 's-box'); box.append(el('h3', null, 'Altri dati pubblicati'));
    righe(box, [
      ['Pazienti in struttura', l.pazientiTotali], ['Pazienti in trattamento', somma(l, 'trattamento')], ['Pazienti in osservazione', somma(l, 'osservazione')],
      ['Num. posti tecnici presidiati', l.postiTecnici],
      ['In struttura da meno di 24 ore', perm?.meno24h], ['In struttura da 24 a 48 ore', perm?.da24a48h], ['In struttura da oltre 48 ore', perm?.oltre48h],
      ...(tm ? COD.filter((cd) => tm[cd] != null).map((cd) => [`Attesa media · ${cd === 'arancione' ? 'arancione' : cd}`, fmtMin(tm[cd])]) : []),
    ]);
    if (box.children.length > 1) dx.append(box);
  }
  const inf = el('section', 's-box'); inf.append(el('h3', null, 'Informazioni'));
  inf.append(info('📍', link(p.indirizzo, `https://www.google.com/maps/search/?api=1&query=${c}`)));
  if (p.telefono) inf.append(info('📞', link(p.telefono, `tel:${p.telefono.replace(/\s/g, '')}`)));
  if (p.sito) inf.append(info('🌐', link(p.sito.replace(/^https?:\/\/(www\.)?/, ''), p.sito)));
  inf.append(info('📄', link('Pagina ufficiale della fonte', p.fonteUrl)));
  if (p.ultimoErrore) inf.append(el('p', 'err', 'La fonte non è raggiungibile: si vede l’ultimo dato valido.'));
  dx.append(inf);
  const dove = el('section', 's-box'); dove.append(el('h3', null, 'Mappa'));
  const mm = el('div'); mm.id = 's-map'; mm.setAttribute('role', 'region'); mm.setAttribute('aria-label', `Posizione di ${p.nome}`); dove.append(mm);
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
