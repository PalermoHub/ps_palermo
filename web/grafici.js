const $ = (id) => document.getElementById(id);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };
const COD = ['rosso', 'arancione', 'azzurro', 'verde', 'bianco'];
const ETI = { rosso: 'Rosso', arancione: 'Arancio', azzurro: 'Azzurro', verde: 'Verde', bianco: 'Bianco' };
const st = { dati: null, storico: null, heat: null, periodo: '24h' };

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

/* ---------- linea della città: ultime 24 ore / 7 giorni con la banda della settimana prima ---------- */
const GG = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'], GGL = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'short' });
function renderCitta() {
  const box = $('citta'); if (!box) return; box.replaceChildren();
  const S = st.storico, S_ = PS_STORICO.s;
  if (!S) { box.append(el('p', 'vuoto', 'Storico non disponibile al momento.')); return; }
  const tutto = S.citta, per = st.periodo, n = per === '24h' ? 48 : tutto.ora.length, off = tutto.ora.length - n;
  const ora = tutto.ora.slice(off), prima = tutto.prima.slice(off);
  if (PS_STORICO.valide(ora).length < 4) { box.append(el('p', 'vuoto', 'Storico in raccolta: i grafici compaiono dopo qualche ora di dati.')); return; }
  const t0 = tutto.da + off * S.passo;
  // banda = minimo e massimo della settimana prima nell'ora attorno (±1 ora), per non inseguire ogni oscillazione
  const banda = prima.map((_, i) => { const v = PS_STORICO.valide(prima.slice(Math.max(0, i - 2), i + 3)); return v.length ? [Math.min(...v), Math.max(...v)] : null; });
  const W = 640, H = 230, L = 34, R = 10, T = 12, B = 28, vals = [...PS_STORICO.valide(ora), ...banda.flatMap((b) => b || [])];
  const max = Math.max(10, Math.ceil(Math.max(...vals) / 20) * 20);
  const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
  const svg = S_('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ln', role: 'img' });
  for (let v = 0; v <= max; v += max / 4) { svg.append(S_('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'ln-g' })); const t = S_('text', { x: L - 6, y: y(v) + 4, class: 'ln-t', 'text-anchor': 'end' }); t.textContent = Math.round(v); svg.append(t); }
  // asse x: ogni 4 ore (24h) o a mezzanotte (7 giorni)
  const passoX = per === '24h' ? 8 : 48;
  for (let i = 0; i < n; i += 1) {
    const ts = t0 + i * S.passo, d = new Date(ts * 1000), hm = fmtOra.format(d);
    const segna = per === '24h' ? i % passoX === 0 : hm === '00:00';
    if (!segna) continue;
    svg.append(S_('line', { x1: x(i), x2: x(i), y1: T, y2: H - B, class: 'ln-g v' }));
    const t = S_('text', { x: x(i), y: H - 8, class: 'ln-t', 'text-anchor': 'middle' }); t.textContent = per === '24h' ? hm : fmtGiorno.format(d); svg.append(t);
  }
  let area = '', pre = null;
  banda.forEach((b, i) => { if (!b) return; area += `${pre == null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(b[1]).toFixed(1)}`; pre = i; });
  for (let i = banda.length - 1; i >= 0; i--) if (banda[i]) area += `L${x(i).toFixed(1)} ${y(banda[i][0]).toFixed(1)}`;
  svg.append(S_('path', { d: area + 'Z', class: 'ln-b' }));
  let d = '', gap = true;
  ora.forEach((v, i) => { if (v == null) { gap = true; return; } d += `${gap ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; gap = false; });
  svg.append(S_('path', { d, class: 'ln-l' }));
  const ult = ora.map((v, i) => [v, i]).filter(([v]) => v != null).at(-1);
  svg.append(S_('circle', { cx: x(ult[1]), cy: y(ult[0]), r: 4, class: 'ln-p' }));
  const sopra = prima[ult[1]] != null ? Math.round(ult[0] - prima[ult[1]]) : null;
  svg.setAttribute('aria-label', `Pazienti in attesa in città, ${per === '24h' ? 'ultime 24 ore' : 'ultimi 7 giorni'}: ora ${Math.round(ult[0])}${sopra == null ? '' : `, ${sopra === 0 ? 'come' : `${Math.abs(sopra)} ${sopra > 0 ? 'in più' : 'in meno'} rispetto a`} la stessa ora della settimana scorsa`}`);
  const leg = el('ul', 'sb-leg'); [['ln-lg', 'Questa settimana'], ['ln-bg', 'Stessa ora, settimana scorsa (min–max)']].forEach(([c, tx]) => { const li = el('li'); li.append(el('i', c), tx); leg.append(li); });
  const nota = el('p', 'bc-nota', `Somma dei presidi che hanno una lettura; i tratti senza dati restano vuoti.${sopra == null ? '' : ` Adesso ${Math.round(ult[0])} in attesa${sopra === 0 ? ', come' : `, ${Math.abs(sopra)} ${sopra > 0 ? 'in più' : 'in meno'} di`} la stessa ora della settimana scorsa.`}`);
  // Interattivo: dito o mouse sul grafico mostrano ora, valore e confronto con la settimana scorsa.
  const cur = S_('line', { y1: T, y2: H - B, class: 'ln-c', visibility: 'hidden' }), pt = S_('circle', { r: 4.5, class: 'ln-p', visibility: 'hidden' }), pb = S_('circle', { r: 3.5, class: 'ln-pb', visibility: 'hidden' });
  svg.append(cur, pb, pt);
  const out = el('p', 'ln-out', 'Tocca o passa il mouse sul grafico per i dettagli.'), base = out.textContent;
  const fLungo = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const muovi = (e) => {
    const r = svg.getBoundingClientRect(); let i = Math.round(((e.clientX - r.left) / r.width * W - L) / (W - L - R) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i)); let k = 0; while (ora[i + k] == null && ora[i - k] == null && k < n) k++;
    const j = ora[i + k] != null ? i + k : i - k; if (ora[j] == null) return;
    cur.setAttribute('x1', x(j)); cur.setAttribute('x2', x(j)); pt.setAttribute('cx', x(j)); pt.setAttribute('cy', y(ora[j]));
    cur.setAttribute('visibility', 'visible'); pt.setAttribute('visibility', 'visible');
    const pr = prima[j], dd = pr == null ? null : Math.round(ora[j] - pr);
    if (pr != null) { pb.setAttribute('cx', x(j)); pb.setAttribute('cy', y(pr)); pb.setAttribute('visibility', 'visible'); } else pb.setAttribute('visibility', 'hidden');
    const when = new Date((t0 + j * S.passo) * 1000);
    out.textContent = `${per === '24h' ? fmtOra.format(when) : fLungo.format(when)} · ${Math.round(ora[j])} in attesa` + (dd == null ? '' : dd === 0 ? ' · come una settimana fa' : ` · ${Math.abs(dd)} ${dd > 0 ? 'in più' : 'in meno'} di una settimana fa (${Math.round(pr)})`);
    out.classList.add('hot');
  };
  const fine = () => { [cur, pt, pb].forEach((e) => e.setAttribute('visibility', 'hidden')); out.textContent = base; out.classList.remove('hot'); };
  ['pointermove', 'pointerdown'].forEach((t) => svg.addEventListener(t, muovi)); ['pointerleave', 'pointercancel'].forEach((t) => svg.addEventListener(t, fine));
  box.append(leg, svg, out, nota);
}
function periodi() {
  const c = $('citta-per'); if (!c) return; c.replaceChildren();
  [['24h', 'Ultime 24 ore'], ['7g', '7 giorni']].forEach(([k, t]) => { const b = el('button', 'chip', t); b.type = 'button'; b.setAttribute('aria-pressed', st.periodo === k); b.addEventListener('click', () => { st.periodo = k; periodi(); renderCitta(); }); c.append(b); });
}

/* ---------- heatmap giorno × ora: mediana dei pazienti in attesa ---------- */
function renderHeat() {
  const box = $('heat'); if (!box) return; box.replaceChildren();
  const H = st.heat, sel = $('heat-ps');
  if (!H || !Object.keys(H.heat).length) { box.append(el('p', 'vuoto', 'Storico in raccolta: la mappa compare quando ci sono dati di qualche giorno.')); sel.hidden = true; sel.parentElement.hidden = true; return; }
  sel.parentElement.hidden = false;
  if (!sel.options.length) {
    sel.append(new Option('Tutta la città (somma)', 'citta'));
    st.dati?.ps.filter((p) => H.heat[p.id]).forEach((p) => sel.append(new Option(p.nome + (p.tipo === 'pediatrico' ? ' (pediatrico)' : ''), p.id)));
    sel.addEventListener('change', renderHeat);
  }
  const m = H.heat[sel.value] || H.heat.citta;
  const tutti = m.flat().filter((v) => v != null); if (!tutti.length) { box.append(el('p', 'vuoto', 'Dati ancora insufficienti per questo presidio.')); return; }
  const max = Math.max(1, ...tutti);
  const tab = el('table', 'hm'), cap = el('caption', 'sr', 'Mediana dei pazienti in attesa per giorno della settimana e ora'); tab.append(cap);
  const th = el('thead'), tr = el('tr'); tr.append(el('td', 'nd0'));
  for (let h = 0; h < 24; h++) tr.append(el('th', h % 3 ? 'n' : null, h % 3 ? '' : String(h)));
  th.append(tr); tab.append(th);
  const tb = el('tbody');
  m.forEach((riga, g) => {
    const r = el('tr'); const rh = el('th', null, GG[g]); rh.scope = 'row'; r.append(rh);
    riga.forEach((v, h) => {
      const c = el('td'); c.title = v == null ? `${GGL[g]} ${h}:00, dati insufficienti` : `${GGL[g]} ${h}:00–${h + 1}:00, mediana ${Math.round(v)} in attesa`;
      if (v != null) c.style.setProperty('--q', (Math.sqrt(v / max) * 100).toFixed(0) + '%'); else c.className = 'nd';
      r.append(c);
    });
    tb.append(r);
  });
  tab.append(tb);
  // le fasce di giorno (7–23) con la mediana più bassa
  const celle = []; m.forEach((riga, g) => riga.forEach((v, h) => { if (v != null && h >= 7 && h < 23) celle.push([v, g, h]); }));
  celle.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const scelte = []; for (const c of celle) { if (scelte.length >= 3) break; if (!scelte.some((s) => s[1] === c[1] && Math.abs(s[2] - c[2]) < 3)) scelte.push(c); }
  const leg = el('div', 'hm-leg'); leg.append(el('span', null, 'Meno in attesa'), el('i'), el('span', null, `Più in attesa (fino a ${Math.round(max)})`));
  const meno = scelte.length ? el('p', 'hm-meno') : null;
  if (meno) { meno.append(el('strong', null, 'Di solito meno carico (7–23): '), scelte.map(([v, g, h]) => `${GGL[g]} ${h}–${h + 1} (≈${Math.round(v)})`).join(' · ')); }
  const periodo = H.dal ? `${H.giorni} giorni di dati, dal ${H.dal.split('-').reverse().join('/')}` : '';
  const av = el('p', 'bc-nota', `Questo è l'andamento medio: non prevede quanto aspetterai tu. L'attesa del singolo paziente dipende dal codice di triage e dalle emergenze in arrivo. ${periodo ? periodo + '. ' : ''}Le celle vuote hanno pochi dati.`);
  const sc = el('div', 'hm-sc'); sc.append(tab);
  box.append(sc, leg); if (meno) box.append(meno); box.append(av);
}

/* ---------- avvio ---------- */
const carica = () => fetch('/api/palermo').then((r) => r.json()).then((d) => { st.dati = d; renderConfronto(); renderAttesa(); renderDumbbell(); renderHeat(); $('sub').textContent = `Dati in tempo reale · ${d.ps.filter((p) => p.lettura).length}/${d.ps.length} pronto soccorso con dati`; });
carica().catch(() => { $('sub').textContent = 'Impossibile caricare i dati. Riprova tra poco.'; });
setInterval(() => carica().catch(() => {}), 120000);
periodi();
const caricaStorico = () => PS_STORICO.carica().then((d) => { st.storico = d; renderCitta(); }).catch(() => renderCitta());
const caricaHeat = () => PS_STORICO.caricaHeat().then((d) => { st.heat = d; renderHeat(); }).catch(() => renderHeat());
caricaStorico(); caricaHeat();
setInterval(caricaStorico, 300000);
