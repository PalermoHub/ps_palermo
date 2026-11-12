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
for (const f of recenti) {
  const [testa, ...righe] = readFileSync(`${DIR}/${f}`, 'utf8').trim().split('\n');
  const col = testa.split(',');
  const iPs = col.indexOf('ps_id'), iT = col.indexOf('rilevato_utc'), iA = col.indexOf('in_attesa');
  for (const r of righe) {
    const c = r.split(','); if (c[iA] === '' || c[iA] == null) continue;
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
const out = { generatoAlle: new Date().toISOString(), giorni: recenti.length, dal: recenti[0]?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null, al: recenti.at(-1)?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null, minCampioni: MIN_CAMPIONI, heat };
writeFileSync(`${DIR}/heatmap.json`, JSON.stringify(out));
console.log(`heatmap: ${recenti.length} giorni, ${Object.keys(heat).length} serie`);
