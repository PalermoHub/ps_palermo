const COD = ['rosso', 'arancione', 'azzurro', 'verde', 'bianco'];
let dati = null, filtro = 'tutti', pos = null;

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim() : `${m}m`);
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
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };

function card(p) {
  const l = p.lettura, art = el('article', 'ps');
  const h = el('h2', null, p.nome); h.append(el('span', 'tag', p.tipo === 'adulti' ? 'adulti' : 'pediatrico'));
  art.append(h, el('p', 'dove', p.struttura + (pos ? ` · ${km(pos, p.coords).toFixed(1)} km` : '')));
  if (!l) { art.append(el('p', 'err', 'Dati non disponibili al momento.')); return art; }

  const num = el('div', 'num');
  const blocco = (v, lab, extra) => { const d = el('div', extra); d.append(el('b', v != null && extra === 'soverf' && v >= 200 ? 'alto' : null, v == null ? '–' : (extra === 'soverf' ? v + '%' : v)), el('small', null, lab)); return d; };
  num.append(blocco(l.inAttesa, 'in attesa'), blocco(l.pazientiTotali, 'in struttura'), blocco(l.sovraffollamentoPct != null ? Math.round(l.sovraffollamentoPct) : null, 'sovraffollamento', 'soverf'));
  art.append(num);

  const g = el('div', 'codici');
  for (const c of COD) {
    const v = l.codici[c]?.attesa, d = el('div', `cod ${c}${v == null ? ' nd' : ''}`);
    d.append(el('b', null, v == null ? '–' : v), el('small', null, c)); g.append(d);
  }
  art.append(g);

  if (l.tempiMediAttesaMin) art.append(el('p', 'tempi', 'Attesa media: ' + COD.filter((c) => l.tempiMediAttesaMin[c] != null).map((c) => `${c} ${fmtMin(l.tempiMediAttesaMin[c])}`).join(' · ')));

  const meta = el('p', 'meta');
  const rilev = eta(l.rilevataAlle), acq = eta(p.acquisitaAlle);
  const usata = rilev ?? acq;
  const m = el('span', usata && usata.min > 30 ? 'vecchio' : null, usata ? `${rilev ? 'Rilevato' : 'Letto'} ${usata.txt}` : '');
  meta.append(m);
  if (p.fonteUrl) { const a = el('a', null, 'fonte'); a.href = p.fonteUrl; a.target = '_blank'; a.rel = 'noopener'; meta.append(a); }
  art.append(meta);
  if (p.ultimoErrore) art.append(el('p', 'err', 'Fonte non raggiungibile: si vede l\'ultimo dato valido.'));
  return art;
}

function render() {
  const lista = document.getElementById('lista'); lista.replaceChildren();
  let ps = dati.ps.filter((p) => filtro === 'tutti' || p.tipo === filtro);
  if (pos) ps = ps.sort((a, b) => km(pos, a.coords) - km(pos, b.coords));
  if (!ps.length) lista.append(el('p', 'vuoto', 'Nessun pronto soccorso.'));
  for (const p of ps) lista.append(card(p));
  const a = eta(dati.aggiornatoAlle);
  document.getElementById('sub').textContent = `Sito aggiornato ${a.txt} · ${dati.ps.filter((p) => p.lettura).length}/${dati.ps.length} pronto soccorso con dati`;
}

document.querySelectorAll('.filtri button[data-f]').forEach((b) => b.addEventListener('click', () => {
  filtro = b.dataset.f;
  document.querySelectorAll('.filtri button[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));
document.getElementById('vicino').addEventListener('click', (e) => {
  if (pos) { pos = null; e.target.setAttribute('aria-pressed', 'false'); return render(); }
  navigator.geolocation?.getCurrentPosition((g) => { pos = { lat: g.coords.latitude, lng: g.coords.longitude }; e.target.setAttribute('aria-pressed', 'true'); render(); }, () => alert('Posizione non disponibile.'));
});

fetch('/api/palermo').then((r) => r.json()).then((d) => { dati = d; render(); })
  .catch(() => { document.getElementById('sub').textContent = 'Impossibile caricare i dati.'; });
