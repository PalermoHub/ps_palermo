const COD = ['rosso', 'arancione', 'azzurro', 'verde', 'bianco'];
const ETI = { rosso: 'Rosso', arancione: 'Arancio', azzurro: 'Azzurro', verde: 'Verde', bianco: 'Bianco' };
const ORDINI = [['attesa', 'Più in attesa'], ['sov', 'Meno affollati'], ['nome', 'Nome']];
const FILTRI = [['tutti', 'Tutti'], ['adulti', 'Adulti'], ['pediatrico', 'Pediatrici']];

const st = { dati: null, filtro: 'tutti', ordine: 'attesa', vista: 'card', q: '', pos: null };
let mappa = null, strato = null, marcatori = [], miniMappa = null, ultimiIds = '';

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
    mappa = L.map(m, { scrollWheelZoom: false }).setView([38.12, 13.36], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mappa);
    strato = L.layerGroup().addTo(mappa);
    mappa.on('zoomend', distanzia);
  }
  strato.clearLayers(); marcatori = [];
  const meno = menoAffollato()?.id, cc = coordsMappa(ps), punti = [];
  ps.forEach((p, i) => {
    const mk = L.marker(cc[i], { icon: pin(p, meno), title: p.nome, keyboard: true, alt: `${p.nome}: ${p.lettura?.inAttesa ?? 'nessun dato'} in attesa` , zIndexOffset: p.lettura?.inAttesa ?? 0 }).addTo(strato);
    const pop = el('div', 'pop'), b = el('button', null, 'Apri la scheda');
    pop.append(el('h3', null, p.nome), el('p', null, `${nd(p.lettura?.inAttesa)} in attesa · ${badge(p, meno).txt}`));
    if (p.lettura) { const g = el('div', 'cod'); COD.forEach((c) => g.append(chip(p.lettura, c))); pop.append(g); }
    pop.append(b);
    b.type = 'button'; b.addEventListener('click', () => apriScheda(p.id));
    mk.bindPopup(pop);
    marcatori.push({ mk, base: cc[i] });
    punti.push(cc[i]);
  });
  if (st.pos) { L.marker([st.pos.lat, st.pos.lng], { icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="pin me"></div>' }), title: 'La tua posizione', interactive: false }).addTo(strato); punti.push([st.pos.lat, st.pos.lng]); }
  if (refit && punti.length) mappa.fitBounds(punti, { paddingTopLeft: [85, 55], paddingBottomRight: [85, 45], maxZoom: 14 });
  distanzia();
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
  fill.style.width = (s == null ? 0 : Math.min(100, Math.round(s / 3))) + '%';
  bar.append(fill, el('u'));
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', s == null ? 'Sovraffollamento non disponibile' : `Sovraffollamento ${Math.round(s)} per cento; il segno indica il 100 per cento`);
  wrap.append(lab, bar); return wrap;
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

function apriScheda(id, daHash) {
  const p = st.dati?.ps.find((x) => x.id === id);
  if (!p) return;
  const l = p.lettura, meno = menoAffollato()?.id, b = badge(p, meno), corpo = $('s-corpo'), f = freschezza(p);
  corpo.replaceChildren();

  const h = el('div', 's-h'), tit = el('div');
  const h2 = el('h2', null, p.nome); h2.id = 's-titolo';
  tit.append(h2, el('p', 'dove', `${p.struttura} · pronto soccorso ${p.tipo === 'adulti' ? 'adulti' : 'pediatrico'}`));
  const x = el('button', 's-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Chiudi la scheda'); x.addEventListener('click', () => $('scheda').close());
  h.append(tit, x); corpo.append(h);
  corpo.append(Object.assign(el('span', `badge ${b.k}`, b.txt), { style: 'align-self:flex-start' }));

  if (!l) corpo.append(el('p', 'err', 'Dati non disponibili al momento.'));
  else {
    const big = el('div', 's-big');
    [[l.inAttesa, 'in attesa'], [l.pazientiTotali, 'in struttura'], [l.sovraffollamentoPct == null ? null : Math.round(l.sovraffollamentoPct) + '%', 'sovraffollamento'], [l.postiTecnici, 'posti tecnici']]
      .filter(([v]) => v != null).forEach(([v, lab]) => { const d = el('div'); d.append(el('b', null, v), el('span', null, lab)); big.append(d); });
    corpo.append(big, barra(l));

    // Tutte le colonne che la fonte pubblica per i codici colore.
    const cols = [['attesa', 'In attesa'], ['trattamento', 'In trattamento'], ['osservazione', 'In osservazione'], ['totale', 'Totale']]
      .filter(([k]) => COD.some((c) => l.codici[c]?.[k] != null));
    const sec = sezione('Pazienti per codice colore'), tw = el('div', 'tw'), t = el('table', 's-t'), hr = el('tr');
    ['Codice', ...cols.map((c) => c[1])].forEach((n) => { const th = el('th', null, n); th.scope = 'col'; hr.append(th); });
    const thd = el('thead'); thd.append(hr); t.append(thd);
    const tb = el('tbody');
    COD.forEach((c) => {
      const tr = el('tr'), th = el('th'), sw = el('span', 'sw'); th.scope = 'row';
      sw.style.background = c === 'bianco' ? '#fff' : `var(--${c})`;
      th.append(sw, ETI[c] === 'Arancio' ? 'Arancione' : ETI[c]); tr.append(th);
      cols.forEach(([k]) => tr.append(el('td', 'n', nd(l.codici[c]?.[k]))));
      tb.append(tr);
    });
    t.append(tb); tw.append(t); sec.append(tw);
    if (cols.length === 1) sec.append(el('p', 's-nota', 'Questo ospedale pubblica solo i pazienti in attesa per codice.'));
    corpo.append(sec);

    const tm = tempiTesto(l);
    if (tm) { const s = sezione('Attesa media'); s.append(el('p', 's-nota', tm.charAt(0).toUpperCase() + tm.slice(1) + '.')); corpo.append(s); }

    const perm = l.permanenza;
    if (perm && (perm.meno24h != null || perm.da24a48h != null || perm.oltre48h != null)) {
      const s = sezione('Da quanto tempo sono in struttura'), g = el('div', 's-perm');
      [[perm.meno24h, 'meno di 24 ore'], [perm.da24a48h, 'da 24 a 48 ore'], [perm.oltre48h, 'oltre 48 ore']].forEach(([v, lab]) => { const d = el('div'); d.append(el('b', null, nd(v)), el('span', null, lab)); g.append(d); });
      s.append(g); corpo.append(s);
    }
  }

  const dove = sezione('Dove si trova');
  dove.append(el('p', 's-nota', p.indirizzo));
  const mm = el('div'); mm.id = 's-map'; mm.setAttribute('role', 'region'); mm.setAttribute('aria-label', `Posizione di ${p.nome}`); dove.append(mm);
  const az = el('div', 's-az'); az.style.marginTop = '10px';
  const c = `${p.coords.lat},${p.coords.lng}`;
  const ind = el('a', 'btn', 'Indicazioni stradali'); ind.href = `https://www.google.com/maps/dir/?api=1&destination=${c}`; ind.target = '_blank'; ind.rel = 'noopener';
  const osm = el('a', 'btn sec', 'Apri su OpenStreetMap'); osm.href = `https://www.openstreetmap.org/?mlat=${p.coords.lat}&mlon=${p.coords.lng}#map=17/${p.coords.lat}/${p.coords.lng}`; osm.target = '_blank'; osm.rel = 'noopener';
  az.append(ind, osm); dove.append(az); corpo.append(dove);

  const fo = sezione('Fonte e aggiornamento');
  fo.append(el('p', 's-nota', f.txt + (f.vecchio ? ': il dato potrebbe non essere aggiornato.' : '.')));
  if (p.ultimoErrore) fo.append(el('p', 'err', 'La fonte non è raggiungibile: si vede l’ultimo dato valido.'));
  const lf = el('a', null, 'Pagina ufficiale della fonte'); lf.href = p.fonteUrl; lf.target = '_blank'; lf.rel = 'noopener';
  const pf = el('p', 's-nota'); pf.append(lf); fo.append(pf);
  const nota = el('p', 's-nota', 'In emergenza chiama il 112.'); nota.style.fontWeight = '700'; fo.append(nota);
  corpo.append(fo);

  const dlg = $('scheda');
  if (!dlg.open) dlg.showModal();
  dlg.dataset.id = id;
  if (!daHash) history.replaceState(null, '', `#ps=${encodeURIComponent(id)}`);
  // La mini-mappa si crea dopo che la scheda è visibile, altrimenti Leaflet misura un contenitore vuoto.
  if (window.L) {
    if (miniMappa) { miniMappa.remove(); miniMappa = null; }
    miniMappa = L.map(mm, { scrollWheelZoom: false }).setView([p.coords.lat, p.coords.lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(miniMappa);
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
