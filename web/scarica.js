// Download dei CSV dello storico: file statici nell'archivio GitHub, indicizzati da indice.json.
// Non passano dal Worker né da D1, quindi scaricarli non costa letture.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };
  const BASE = 'https://raw.githubusercontent.com/PalermoHub/ps_palermo/main/dati/storico/';
  const st = { indice: undefined, per: 'giorni', sel: {} };
  const num = new Intl.NumberFormat('it-IT');
  const fGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const fBreve = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const fMese = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const d = (id) => new Date(`${id}T00:00:00Z`);
  const kb = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`);
  const PERIODI = [['giorni', 'Giorno'], ['settimane', 'Settimana'], ['mesi', 'Mese']];
  const etichetta = {
    giorni: (x) => fGiorno.format(d(x.id)),
    settimane: (x) => `Settimana ${Number(x.id.split('-W')[1])} · ${fBreve.format(d(x.da))} – ${fBreve.format(d(x.a))} ${x.a.slice(0, 4)}`,
    mesi: (x) => fMese.format(d(x.da)),
  };

  /** Un selettore limita l'elenco a un mese (giorni) o a un anno (settimane e mesi): così la lista non cresce all'infinito. */
  const gruppo = { giorni: (x) => x.id.slice(0, 7), settimane: (x) => x.da.slice(0, 4), mesi: (x) => x.da.slice(0, 4) };
  const nomeGruppo = { giorni: (k) => fMese.format(d(`${k}-01`)), settimane: (k) => k, mesi: (k) => k };

  async function scarica(x, b) {
    const t = b.textContent; b.disabled = true; b.textContent = 'Scarico…';
    try {
      const r = await fetch(BASE + x.file); if (!r.ok) throw new Error(r.status);
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = `ps-palermo-${x.file.split('/').pop()}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      b.textContent = 'Scaricato';
    } catch { b.textContent = 'Non riesco a scaricare'; }
    setTimeout(() => { b.textContent = t; b.disabled = false; }, 2500);
  }

  function render() {
    const box = $('scarica'); if (!box) return; box.replaceChildren(); $('scarica-per')?.querySelector('.dl-sel')?.remove();
    if (st.indice === undefined) { box.append(el('p', 'vuoto', 'Caricamento…')); return; }
    if (!st.indice) { box.append(el('p', 'vuoto', 'L\'elenco dei file non è disponibile al momento. Riprova più tardi.')); return; }
    const elenco = st.indice[st.per] ?? [];
    if (!elenco.length) { box.append(el('p', 'vuoto', st.per === 'giorni' ? 'Ancora nessun giorno archiviato.' : (st.per === 'mesi' ? 'Ancora nessun mese concluso' : 'Ancora nessuna settimana conclusa') + ': i file compaiono a periodo finito.')); return; }
    const chiavi = [...new Set(elenco.map(gruppo[st.per]))]; // l'indice è dal più recente: la prima è la più recente
    const scelta = chiavi.includes(st.sel[st.per]) ? st.sel[st.per] : chiavi[0];
    const riga = $('scarica-per'); riga?.querySelector('.dl-sel')?.remove();
    if (chiavi.length > 1 && riga) {
      const sel = el('select', 'dl-sel');
      sel.setAttribute('aria-label', st.per === 'giorni' ? 'Mese' : 'Anno');
      chiavi.forEach((k) => sel.append(new Option(nomeGruppo[st.per](k), k, false, k === scelta)));
      sel.addEventListener('change', () => { st.sel[st.per] = sel.value; render(); });
      riga.append(sel);
    }
    const ul = el('ul', 'dl');
    elenco.filter((x) => gruppo[st.per](x) === scelta).forEach((x) => {
      const li = el('li'), t = el('div', 'dl-t');
      t.append(el('b', null, etichetta[st.per](x)), el('small', null, `${num.format(x.righe)} righe${x.byte ? ` · ${kb(x.byte)}` : ''}${st.per !== 'giorni' ? ` · ${x.giorni} giorni con dati` : ''}`));
      const b = el('button', 'exp-b', 'Scarica CSV'); b.type = 'button';
      b.setAttribute('aria-label', `Scarica il CSV: ${etichetta[st.per](x)}`);
      b.addEventListener('click', () => scarica(x, b));
      li.append(t, b); ul.append(li);
    });
    const doc = el('button', 'exp-b', 'Descrizione delle colonne (CSV)'); doc.type = 'button';
    doc.addEventListener('click', () => scarica({ file: 'descrizione-colonne.csv' }, doc));
    const rigaDoc = el('div', 'exp-r'); rigaDoc.append(doc);
    box.append(ul, rigaDoc, el('p', 'bc-nota', `Colonne: ${st.indice.colonne.replaceAll(',', ', ')}. Orari in UTC. Un campo vuoto vuol dire che la fonte non pubblica quel dato. Cosa significa ogni colonna e a cosa serve è nel file di descrizione.`));
  }
  function periodi() {
    const c = $('scarica-per'); if (!c) return; c.replaceChildren();
    PERIODI.forEach(([k, t]) => { const b = el('button', 'chip', t); b.type = 'button'; b.setAttribute('aria-pressed', st.per === k); b.addEventListener('click', () => { st.per = k; periodi(); render(); }); c.append(b); });
  }
  periodi(); render();
  fetch(BASE + 'indice.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((i) => { st.indice = i; }).catch(() => { st.indice = null; }).finally(render);
})();
