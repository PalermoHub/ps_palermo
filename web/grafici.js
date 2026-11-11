const $ = (id) => document.getElementById(id);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };
const COD = ['rosso', 'arancione', 'azzurro', 'verde', 'bianco'];
const ETI = { rosso: 'Rosso', arancione: 'Arancio', azzurro: 'Azzurro', verde: 'Verde', bianco: 'Bianco' };
const st = { dati: null };

/* ---------- tema ---------- */
const tema = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
const ICONE = { luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>', sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>' };
function impostaTema(t, salva) {
  document.documentElement.dataset.theme = t;
  if (salva) try { localStorage.setItem('tema', t); } catch {}
  const b = $('tema'); b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[t === 'dark' ? 'sole' : 'luna']}</svg>`;
  b.title = b.ariaLabel = t === 'dark' ? 'Tema chiaro' : 'Tema scuro';
}
$('tema').addEventListener('click', () => impostaTema(tema() === 'dark' ? 'light' : 'dark', true));
impostaTema(tema());
$('condividi').innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3"/></svg>';
$('condividi').addEventListener('click', async (e) => {
  const b = e.currentTarget, url = location.origin + location.pathname;
  try { if (navigator.share) await navigator.share({ title: document.title, url }); else { await navigator.clipboard.writeText(url); b.title = 'Link copiato'; setTimeout(() => (b.title = 'Condividi'), 2000); } } catch {}
});

/* ---------- bullet chart del sovraffollamento ---------- */
/** Una barra per presidio: lunghezza = indice di sovraffollamento, segno al 100% = capacità. Il tratto oltre il 100% è l'eccesso. */
function renderConfronto() {
  const box = $('confronto'); if (!box) return; box.replaceChildren();
  const con = st.dati.ps.filter((p) => p.lettura?.sovraffollamentoPct != null).sort((a, b) => b.lettura.sovraffollamentoPct - a.lettura.sovraffollamentoPct);
  if (!con.length) { box.append(el('p', 'vuoto', 'Nessun dato di sovraffollamento disponibile al momento.')); return; }
  const max = Math.max(200, Math.ceil(Math.max(...con.map((p) => p.lettura.sovraffollamentoPct)) / 50) * 50), pos = (v) => (v / max * 100).toFixed(2) + '%';
  const ass = el('div', 'bc-asse'); ass.setAttribute('aria-hidden', 'true');
  for (let v = 0; v <= max; v += 50) { const t = el('span', v === 100 ? 'cap' : null, v + '%'); t.style.left = pos(v); ass.append(t); }
  const lista = el('ol', 'bc'); lista.style.setProperty('--cap', pos(100));
  con.forEach((p) => {
    const l = p.lettura, s = l.sovraffollamentoPct, oltre = Math.round(s - 100);
    const li = el('li'), b = el('button', 'bc-r'); b.type = 'button'; b.addEventListener('click', () => { location.href = `/#ps=${encodeURIComponent(p.id)}`; });
    const nome = el('span', 'bc-n'); nome.append(el('b', null, p.nome), p.tipo === 'pediatrico' ? el('em', null, ' pediatrico') : '');
    const dett = [l.pazientiTotali != null && `${l.pazientiTotali} presenti`, l.postiTecnici != null && `${l.postiTecnici} posti`].filter(Boolean).join(' · ');
    const num = el('span', 'bc-v'); num.append(el('b', oltre > 0 ? 'sopra' : 'sotto', oltre > 0 ? `+${oltre}%` : 'In capacità'), el('small', null, dett));
    const bar = el('span', 'bc-b'), den = el('i', 'dentro'), ecc = el('i', 'eccesso'), seg = el('u');
    den.style.width = pos(Math.min(s, 100)); ecc.style.left = pos(100); ecc.style.width = s > 100 ? pos(s - 100) : '0';
    bar.append(den, ecc, seg);
    b.setAttribute('aria-label', `${p.nome}: sovraffollamento ${Math.round(s)} per cento, ${oltre > 0 ? `${oltre} punti sopra la capacità` : 'entro la capacità'}${dett ? `; ${dett}` : ''}. Apri la scheda.`);
    b.append(nome, num, bar); li.append(b); lista.append(li);
  });
  const nd = st.dati.ps.length - con.length;
  const nota = el('p', 'bc-nota', `Il segno verticale è il 100%: la capacità dei posti tecnici presidiati. Il tratto colorato oltre il segno è l'eccesso.${nd ? ` ${nd} presidi senza dato non compaiono.` : ''}`);
  box.append(ass, lista, nota);
}

/* ---------- barre impilate: pazienti in attesa per codice colore ---------- */
/** Una barra per presidio, segmenti = codici colore, scala comune a tutte le barre, ordine per pazienti in attesa. */
function renderAttesa() {
  const box = $('attesa'); if (!box) return; box.replaceChildren();
  const tot = (p) => COD.reduce((s, c) => s + (p.lettura.codici[c]?.attesa ?? 0), 0);
  const con = st.dati.ps.filter((p) => p.lettura && COD.some((c) => p.lettura.codici[c]?.attesa != null)).map((p) => [p, tot(p)]).sort((a, b) => b[1] - a[1] || a[0].nome.localeCompare(b[0].nome, 'it'));
  if (!con.length) { box.append(el('p', 'vuoto', 'Nessun dato sui pazienti in attesa disponibile al momento.')); return; }
  const max = Math.max(1, con[0][1]);
  const leg = el('ul', 'sb-leg'); COD.forEach((c) => { const li = el('li'); li.append(el('i', `c-${c}`), ETI[c]); leg.append(li); });
  const lista = el('ol', 'bc sb');
  con.forEach(([p, t]) => {
    const li = el('li'), b = el('button', 'bc-r'); b.type = 'button'; b.addEventListener('click', () => { location.href = `/#ps=${encodeURIComponent(p.id)}`; });
    const nome = el('span', 'bc-n'); nome.append(el('b', null, p.nome), p.tipo === 'pediatrico' ? el('em', null, ' pediatrico') : '');
    const num = el('span', 'bc-v'); num.append(el('b', null, t), el('small', null, 'in attesa'));
    const bar = el('span', 'bc-b sb-b'), parti = [];
    COD.forEach((c) => {
      const v = p.lettura.codici[c]?.attesa; if (!v) return;
      const s = el('i', `c-${c}`, v / max >= 0.05 ? v : ''); s.style.width = (v / max * 100).toFixed(2) + '%'; s.title = `${ETI[c]}: ${v}`; bar.append(s); parti.push(`${ETI[c].toLowerCase()} ${v}`);
    });
    b.setAttribute('aria-label', `${p.nome}: ${t} in attesa${parti.length ? ` (${parti.join(', ')})` : ''}. Apri la scheda.`);
    b.append(nome, num, bar); li.append(b); lista.append(li);
  });
  const nd = st.dati.ps.length - con.length;
  box.append(leg, lista, el('p', 'bc-nota', `Conta solo chi è in attesa di visita, per codice colore.${nd ? ` ${nd} presidi senza dato non compaiono.` : ''}`));
}

/* ---------- dumbbell: in attesa vs in struttura ---------- */
/** Per presidio due punti sulla stessa scala: in attesa di visita e presenti in struttura. La distanza = pazienti già presi in carico che occupano ancora il PS (osservazione, attesa di posto letto). */
function renderDumbbell() {
  const box = $('dumbbell'); if (!box) return; box.replaceChildren();
  const con = st.dati.ps.filter((p) => p.lettura && p.lettura.inAttesa != null && p.lettura.pazientiTotali != null)
    .map((p) => [p, p.lettura.inAttesa, p.lettura.pazientiTotali, p.lettura.pazientiTotali - p.lettura.inAttesa])
    .sort((a, b) => b[3] - a[3] || b[2] - a[2] || a[0].nome.localeCompare(b[0].nome, 'it'));
  if (!con.length) { box.append(el('p', 'vuoto', 'Nessun dato disponibile al momento.')); return; }
  const max = Math.max(10, Math.ceil(Math.max(...con.map((x) => Math.max(x[1], x[2]))) / 10) * 10), pos = (v) => (v / max * 100).toFixed(2) + '%';
  const leg = el('ul', 'sb-leg');
  [['db-a', 'In attesa di visita'], ['db-s', 'In struttura (totale presenti)']].forEach(([c, t]) => { const li = el('li'); li.append(el('i', c), t); leg.append(li); });
  const ass = el('div', 'bc-asse'); ass.setAttribute('aria-hidden', 'true');
  const passo = max <= 60 ? 10 : max <= 150 ? 25 : 50;
  for (let v = 0; v <= max; v += passo) { const t = el('span', null, String(v)); t.style.left = pos(v); ass.append(t); }
  const lista = el('ol', 'bc');
  con.forEach(([p, a, s, d]) => {
    const li = el('li'), b = el('button', 'bc-r'); b.type = 'button'; b.addEventListener('click', () => { location.href = `/#ps=${encodeURIComponent(p.id)}`; });
    const nome = el('span', 'bc-n'); nome.append(el('b', null, p.nome), p.tipo === 'pediatrico' ? el('em', null, ' pediatrico') : '');
    const num = el('span', 'bc-v'); num.append(el('b', d > 0 ? 'sopra' : null, d > 0 ? `+${d}` : String(d)), el('small', null, `${a} in attesa · ${s} in struttura`));
    const bar = el('span', 'bc-b db-b'), lin = el('i', 'db-l'), pa = el('u', 'db-a'), ps = el('u', 'db-s');
    const lo = Math.min(a, s), hi = Math.max(a, s);
    lin.style.left = pos(lo); lin.style.width = pos(hi - lo); pa.style.left = pos(a); ps.style.left = pos(s);
    bar.append(lin, pa, ps);
    b.setAttribute('aria-label', `${p.nome}: ${a} in attesa di visita, ${s} in struttura; ${d} già presi in carico che occupano il pronto soccorso. Apri la scheda.`);
    b.append(nome, num, bar); li.append(b); lista.append(li);
  });
  const nd = st.dati.ps.length - con.length;
  box.append(leg, ass, lista, el('p', 'bc-nota', `La distanza tra i due punti sono i pazienti già presi in carico ma ancora nel pronto soccorso (osservazione, attesa di posto letto).${nd ? ` ${nd} presidi senza dato non compaiono.` : ''}`));
}

/* ---------- avvio ---------- */
const carica = () => fetch('/api/palermo').then((r) => r.json()).then((d) => { st.dati = d; renderConfronto(); renderAttesa(); renderDumbbell(); $('sub').textContent = `Dati in tempo reale · ${d.ps.filter((p) => p.lettura).length}/${d.ps.length} pronto soccorso con dati`; });
carica().catch(() => { $('sub').textContent = 'Impossibile caricare i dati. Riprova tra poco.'; });
setInterval(() => carica().catch(() => {}), 120000);
