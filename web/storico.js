/* Dati storici e disegno dei grafici, condivisi da index e grafici. */
const PS_STORICO = (() => {
  // La heatmap è calcolata ogni notte dall'Action sui CSV nel repo.
  const URL_HEAT = 'https://raw.githubusercontent.com/PalermoHub/ps_palermo/main/dati/storico/heatmap.json';
  const ns = 'http://www.w3.org/2000/svg';
  const s = (t, a = {}) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const valide = (v) => v.filter((x) => x != null);

  /** Sparkline: una riga per le ultime 24 ore, i buchi (nessuna lettura) restano buchi. null se i punti sono troppo pochi. */
  function spark(serie, da, passo, cap) {
    if (!serie || valide(serie).length < 6) return null;
    const W = 300, H = 40, P = 3, v = valide(serie), max = Math.max(1, ...v), n = serie.length;
    const x = (i) => P + (i / (n - 1)) * (W - 2 * P), y = (val) => H - P - (val / max) * (H - 2 * P);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spk', role: 'img' });
    let d = '', area = '', ini = null;
    serie.forEach((val, i) => {
      if (val == null) { if (ini != null) area += `L${x(i - 1).toFixed(1)} ${H - P}Z`; ini = null; return; }
      d += `${ini == null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(val).toFixed(1)}`;
      if (ini == null) { area += `M${x(i).toFixed(1)} ${H - P}L${x(i).toFixed(1)} ${y(val).toFixed(1)}`; ini = i; } else area += `L${x(i).toFixed(1)} ${y(val).toFixed(1)}`;
    });
    if (ini != null) area += `L${x(n - 1).toFixed(1)} ${H - P}Z`;
    svg.append(s('path', { d: area, class: 'spk-a' }), s('path', { d, class: 'spk-l', 'vector-effect': 'non-scaling-stroke' }));
    const ult = serie.map((val, i) => [val, i]).filter(([val]) => val != null).at(-1);
    const dot = s('circle', { cx: x(ult[1]), cy: y(ult[0]), r: 2.6, class: 'spk-p' });
    svg.append(dot);
    const picco = Math.round(Math.max(...v));
    // Interattiva: il dito o il mouse sul grafico mostra ora e valore al posto della didascalia.
    if (da != null && cap) {
      const testo0 = cap.textContent, cur = s('line', { y1: P, y2: H - P, class: 'spk-c', visibility: 'hidden' }), pt = s('circle', { r: 3.2, class: 'spk-p', visibility: 'hidden' });
      svg.append(cur, pt);
      const hm = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
      const muovi = (e) => {
        const r = svg.getBoundingClientRect(); let i = Math.round(((e.clientX - r.left) / r.width * W - P) / (W - 2 * P) * (n - 1));
        i = Math.max(0, Math.min(n - 1, i));
        // se in quel punto non c'è lettura, prendi la più vicina
        let k = 0; while (serie[i + k] == null && serie[i - k] == null && k < n) k++;
        const j = serie[i + k] != null ? i + k : i - k; if (serie[j] == null) return;
        cur.setAttribute('x1', x(j)); cur.setAttribute('x2', x(j)); pt.setAttribute('cx', x(j)); pt.setAttribute('cy', y(serie[j]));
        cur.setAttribute('visibility', 'visible'); pt.setAttribute('visibility', 'visible');
        cap.textContent = `${hm.format(new Date((da + j * passo) * 1000))} · ${Math.round(serie[j])} in attesa`; cap.classList.add('spk-hot');
      };
      const fine = () => { cur.setAttribute('visibility', 'hidden'); pt.setAttribute('visibility', 'hidden'); cap.textContent = testo0; cap.classList.remove('spk-hot'); };
      svg.addEventListener('pointermove', muovi); svg.addEventListener('pointerdown', muovi);
      svg.addEventListener('pointerleave', fine); svg.addEventListener('pointercancel', fine);
    }
    svg.setAttribute('aria-label', `Pazienti in attesa nelle ultime 24 ore: picco ${picco}, ora ${Math.round(ult[0])}`);
    return svg;
  }
  /** Grafico a linea interattivo di una serie (24h o 7g): asse, area, e al tocco/mouse ora e valore. */
  function linea(serie, da, passo, per) {
    const n = serie.length, v = valide(serie);
    if (v.length < 6) return null;
    const W = 640, H = 220, L = 32, R = 10, T = 12, B = 26, max = Math.max(4, Math.ceil(Math.max(...v) / 4) * 4);
    const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (val) => T + (1 - val / max) * (H - T - B);
    const fOra = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    const fGg = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'short' });
    const fLungo = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', hour: '2-digit', minute: '2-digit' });
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ln' });
    for (let k = 0; k <= 4; k++) {
      const val = max / 4 * k, g = s('line', { x1: L, x2: W - R, y1: y(val), y2: y(val), class: 'ln-g' }), t = s('text', { x: L - 6, y: y(val) + 4, class: 'ln-t', 'text-anchor': 'end' });
      t.textContent = Math.round(val); svg.append(g, t);
    }
    for (let i = 0; i < n; i++) {
      const d = new Date((da + i * passo) * 1000), hm = fOra.format(d);
      if (!(per === '24h' ? i % 8 === 0 : hm === '00:00')) continue;
      const t = s('text', { x: x(i), y: H - 7, class: 'ln-t', 'text-anchor': 'middle' }); t.textContent = per === '24h' ? hm : fGg.format(d);
      svg.append(s('line', { x1: x(i), x2: x(i), y1: T, y2: H - B, class: 'ln-g v' }), t);
    }
    let d = '', area = '', gap = true, ult = -1;
    serie.forEach((val, i) => {
      if (val == null) { if (!gap) area += `L${x(i - 1).toFixed(1)} ${H - B}Z`; gap = true; return; }
      const px = x(i).toFixed(1), py = y(val).toFixed(1);
      d += `${gap ? 'M' : 'L'}${px} ${py}`; area += gap ? `M${px} ${H - B}L${px} ${py}` : `L${px} ${py}`; gap = false; ult = i;
    });
    if (!gap) area += `L${x(n - 1).toFixed(1)} ${H - B}Z`;
    svg.append(s('path', { d: area, class: 'ln-a' }), s('path', { d, class: 'ln-l' }));
    const cur = s('line', { y1: T, y2: H - B, class: 'ln-c', visibility: 'hidden' }), pt = s('circle', { r: 4.5, class: 'ln-p', visibility: 'hidden' });
    svg.append(cur, pt, s('circle', { cx: x(ult), cy: y(serie[ult]), r: 4, class: 'ln-p' }));
    const w = document.createElement('div'), out = document.createElement('p');
    out.className = 'ln-out'; const base = `Pazienti in attesa, ${per === '24h' ? 'ultime 24 ore' : 'ultimi 7 giorni'}. Tocca il grafico per i dettagli.`; out.textContent = base;
    const muovi = (e) => {
      const m = svg.getScreenCTM(); if (!m) return; const px = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x; let i = Math.round((px - L) / (W - L - R) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i)); let k = 0; while (serie[i + k] == null && serie[i - k] == null && k < n) k++;
      const j = serie[i + k] != null ? i + k : i - k; if (serie[j] == null) return;
      cur.setAttribute('x1', x(j)); cur.setAttribute('x2', x(j)); pt.setAttribute('cx', x(j)); pt.setAttribute('cy', y(serie[j]));
      cur.setAttribute('visibility', 'visible'); pt.setAttribute('visibility', 'visible');
      out.textContent = `${per === '24h' ? fOra.format(new Date((da + j * passo) * 1000)) : fLungo.format(new Date((da + j * passo) * 1000))} · ${Math.round(serie[j])} in attesa`; out.classList.add('hot');
    };
    const fine = () => { cur.setAttribute('visibility', 'hidden'); pt.setAttribute('visibility', 'hidden'); out.textContent = base; out.classList.remove('hot'); };
    svg.addEventListener('pointermove', muovi); svg.addEventListener('pointerdown', muovi); svg.addEventListener('pointerleave', fine); svg.addEventListener('pointercancel', fine);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Pazienti in attesa, ${per === '24h' ? 'ultime 24 ore' : 'ultimi 7 giorni'}: picco ${Math.round(Math.max(...v))}, ora ${Math.round(serie[ult])}`);
    w.className = 'ln-w'; w.append(svg, out); return w;
  }
  return { linea, carica: () => json('/api/storico'), caricaHeat: () => json(URL_HEAT), spark, s, valide };
})();
