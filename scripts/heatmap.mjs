// Legge i CSV in dati/storico/ e scrive dati/storico/heatmap.json:
// mediana dei pazienti in attesa per giorno della settimana (0 = lunedì) × ora (Europe/Rome), per presidio e per città,
// sulle ultime 8 settimane. Uso: node scripts/heatmap.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = 'dati/storico', SETTIMANE = 8, MIN_CAMPIONI = 3;
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', hour12: false });
const GIORNI = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mediana = (v) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const files = readdirSync(DIR, { recursive: true }).filter((f) => /\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
const recenti = files.slice(-SETTIMANE * 7);
// media oraria per presidio: ora(UTC, in ore dall'epoca) -> ps -> [valori]
const orarie = new Map();
// permanenza per giorno (Europe/Rome): giorno -> ps -> [[24-48h, oltre48h, totale], ...]
const dataRome = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' });
const permGiorno = new Map();
// sovraffollamento per giorno: giorno -> ps -> [sovraff, ...]
const sovGiorno = new Map();
for (const f of recenti) {
  const [testa, ...righe] = readFileSync(`${DIR}/${f}`, 'utf8').trim().split('\n');
  const col = testa.split(',');
  const iPs = col.indexOf('ps_id'), iT = col.indexOf('rilevato_utc'), iA = col.indexOf('in_attesa');
  const iS = col.indexOf('sovraff');
  const iP1 = col.indexOf('perm_meno24h'), iP2 = col.indexOf('perm_24_48h'), iP3 = col.indexOf('perm_oltre48h');
  for (const r of righe) {
    const c = r.split(',');
    if (iS >= 0 && c[iS] !== '' && c[iS] != null) {
      const g = dataRome.format(new Date(c[iT])), m = sovGiorno.get(g) ?? sovGiorno.set(g, new Map()).get(g);
      (m.get(c[iPs]) ?? m.set(c[iPs], []).get(c[iPs])).push(Number(c[iS]));
    }
    if (iP1 >= 0 && c[iP1] !== '' && c[iP2] !== '' && c[iP3] !== '') {
      const g = dataRome.format(new Date(c[iT])), m = permGiorno.get(g) ?? permGiorno.set(g, new Map()).get(g);
      (m.get(c[iPs]) ?? m.set(c[iPs], []).get(c[iPs])).push([Number(c[iP2]), Number(c[iP3]), Number(c[iP1]) + Number(c[iP2]) + Number(c[iP3])]);
    } if (c[iA] === '' || c[iA] == null) continue;
    const h = Math.floor(Date.parse(c[iT]) / 3600_000);
    const m = orarie.get(h) ?? orarie.set(h, new Map()).get(h);
    (m.get(c[iPs]) ?? m.set(c[iPs], []).get(c[iPs])).push(Number(c[iA]));
  }
}
const nuova = () => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
const camp = {};
let npsMax = 0;
for (const m of orarie.values()) npsMax = Math.max(npsMax, m.size);
for (const [h, m] of orarie) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(h * 3600_000)).map((x) => [x.type, x.value]));
  const g = GIORNI.indexOf(p.weekday), o = Number(p.hour) % 24;
  let tot = 0;
  for (const [ps, v] of m) { const media = v.reduce((a, b) => a + b, 0) / v.length; tot += media; (camp[ps] ??= nuova())[g][o].push(media); }
  // La città conta solo le ore con almeno metà dei presidi, altrimenti il totale è una buca falsa.
  if (m.size >= Math.ceil(npsMax / 2)) (camp.citta ??= nuova())[g][o].push(tot);
}
const heat = Object.fromEntries(Object.entries(camp).map(([ps, gg]) => [ps, gg.map((hh) => hh.map((v) => (v.length >= MIN_CAMPIONI ? Math.round(mediana(v) * 10) / 10 : null)))]));

// ---- Profilo orario: feriali (lun–ven) contro weekend (sab–dom), mediana delle medie orarie. Serve già con pochi giorni di dati.
const MIN_PROFILO = 2;
const prof = {};
for (const [h, m] of orarie) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(h * 3600_000)).map((x) => [x.type, x.value]));
  const k = GIORNI.indexOf(p.weekday) >= 5 ? 1 : 0, o = Number(p.hour) % 24;
  let tot = 0;
  for (const [ps, v] of m) { const media = v.reduce((a, b) => a + b, 0) / v.length; tot += media; ((prof[ps] ??= [Array.from({ length: 24 }, () => []), Array.from({ length: 24 }, () => [])])[k][o]).push(media); }
  if (m.size >= Math.ceil(npsMax / 2)) ((prof.citta ??= [Array.from({ length: 24 }, () => []), Array.from({ length: 24 }, () => [])])[k][o]).push(tot);
}
const profilo = Object.fromEntries(Object.entries(prof).map(([ps, kk]) => [ps, kk.map((hh) => hh.map((v) => (v.length >= MIN_PROFILO ? Math.round(mediana(v) * 10) / 10 : null)))]));
const nGiorni = [0, 0];
for (const f of recenti) { const d = f.match(/\d{4}-\d{2}-\d{2}/)?.[0]; if (d) nGiorni[[0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay()) ? 1 : 0]++; }

// ---- Picco dell'ultima settimana: l'ora con più pazienti in attesa per presidio, e la mediana di quel presidio nello stesso periodo.
const ore = [...orarie.keys()].sort((a, b) => a - b), ultima = ore.at(-1) ?? 0, daSett = ultima - 7 * 24;
const picco = {};
for (const h of ore) {
  if (h <= daSett) continue;
  for (const [ps, v] of orarie.get(h)) {
    const media = v.reduce((a, b) => a + b, 0) / v.length, o = (picco[ps] ??= { max: -1, h: 0, v: [] });
    o.v.push(media); if (media > o.max) { o.max = media; o.h = h; }
  }
}
for (const ps of Object.keys(picco)) { const o = picco[ps]; picco[ps] = { valore: Math.round(o.max * 10) / 10, quando: new Date(o.h * 3600_000).toISOString(), mediana: Math.round(mediana(o.v) * 10) / 10, ore: o.v.length }; }

// ---- Permanenza oltre 24 ore, un punto al giorno (media delle letture del giorno). La città somma i presidi che la pubblicano.
const perm = {};
for (const g of [...permGiorno.keys()].sort().slice(-56)) {
  let c24 = 0, c48 = 0, ct = 0, n = 0;
  for (const [ps, v] of permGiorno.get(g)) {
    const a = v.reduce((s, x) => s + x[0], 0) / v.length, b = v.reduce((s, x) => s + x[1], 0) / v.length, t = v.reduce((s, x) => s + x[2], 0) / v.length;
    (perm[ps] ??= []).push({ g, a: Math.round(a * 10) / 10, b: Math.round(b * 10) / 10, t: Math.round(t * 10) / 10, n: v.length });
    c24 += a; c48 += b; ct += t; n++;
  }
  (perm.citta ??= []).push({ g, a: Math.round(c24 * 10) / 10, b: Math.round(c48 * 10) / 10, t: Math.round(ct * 10) / 10, n });
}

// ---- Sovraffollamento: per giorno e presidio, quota delle letture sopra il 100% dei posti e indice medio.
const sovra = {};
for (const g of [...sovGiorno.keys()].sort().slice(-56)) {
  for (const [ps, v] of sovGiorno.get(g)) (sovra[ps] ??= []).push({ g, q: Math.round(v.filter((x) => x > 100).length / v.length * 1000) / 10, m: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length });
}

// ---- Ieri contro la settimana scorsa: media oraria (ora di Palermo) dell'ultimo giorno con dati e dello stesso giorno 7 giorni prima.
const ultimoG = recenti.at(-1)?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
const giornoPrima = ultimoG ? new Date(Date.parse(ultimoG + 'T12:00:00Z') - 7 * 86400_000).toISOString().slice(0, 10) : null;
const conf = {};
for (const [h, m] of orarie) {
  const d = new Date(h * 3600_000), g = dataRome.format(d);
  const k = g === ultimoG ? 0 : g === giornoPrima ? 1 : -1; if (k < 0) continue;
  const o = Number(Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])).hour) % 24;
  let tot = 0;
  for (const [ps, v] of m) { const media = v.reduce((a, b) => a + b, 0) / v.length; tot += media; ((conf[ps] ??= [Array(24).fill(null), Array(24).fill(null)])[k][o]) = Math.round(media * 10) / 10; }
  if (m.size >= Math.ceil(npsMax / 2)) (conf.citta ??= [Array(24).fill(null), Array(24).fill(null)])[k][o] = Math.round(tot * 10) / 10;
}
const confronto = { ieri: ultimoG, prima: giornoPrima, serie: conf };
const out = { generatoAlle: new Date().toISOString(), giorni: recenti.length, dal: recenti[0]?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null, al: recenti.at(-1)?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null, minCampioni: MIN_CAMPIONI, heat, profilo, giorniProfilo: { feriali: nGiorni[0], weekend: nGiorni[1] }, picco, perm, sovra, confronto };
writeFileSync(`${DIR}/heatmap.json`, JSON.stringify(out));
console.log(`heatmap: ${recenti.length} giorni, ${Object.keys(heat).length} serie`);
