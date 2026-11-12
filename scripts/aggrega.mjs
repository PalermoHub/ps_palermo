// Dai CSV giornalieri in dati/storico/AAAA/AAAA-MM-GG.csv produce:
//  - dati/storico/settimane/AAAA-Wss.csv  (settimana ISO, lunedì–domenica)
//  - dati/storico/mesi/AAAA-MM.csv
//  - dati/storico/indice.json             (elenco dei file scaricabili, letto dal sito)
// Settimane e mesi si scrivono solo quando sono chiusi: i file non cambiano più e la cronologia git non cresce a ogni notte.
// Il giorno in corso non c'è: il backup scarica sempre «ieri». Uso: node scripts/aggrega.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const DIR = process.env.DIR_STORICO || 'dati/storico';
const giorni = readdirSync(DIR, { recursive: true }).map(String).filter((f) => /(^|\/)\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort((a, b) => a.split('/').pop().localeCompare(b.split('/').pop()));

const letti = []; // { id, testa, righe }
for (const f of giorni) {
  const [testa, ...righe] = readFileSync(`${DIR}/${f}`, 'utf8').split('\n').filter(Boolean);
  if (righe.length) letti.push({ id: f.split('/').pop().replace('.csv', ''), testa, righe });
}
if (!letti.length) { console.log('nessun giorno con dati'); process.exit(0); }
const ultimo = letti.at(-1).id;

const giornoUtc = (id) => new Date(`${id}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
/** Settimana ISO «AAAA-Wss» e lunedì/domenica che la delimitano. */
function settimana(id) {
  const d = giornoUtc(id), n = (d.getUTCDay() + 6) % 7; // 0 = lunedì
  const lun = new Date(d); lun.setUTCDate(d.getUTCDate() - n);
  const gio = new Date(lun); gio.setUTCDate(lun.getUTCDate() + 3); // il giovedì decide l'anno ISO
  const anno = gio.getUTCFullYear(), primo = new Date(Date.UTC(anno, 0, 4)), n1 = (primo.getUTCDay() + 6) % 7;
  const w = 1 + Math.round((lun - new Date(primo.getTime() - n1 * 86400000)) / (7 * 86400000));
  const dom = new Date(lun); dom.setUTCDate(lun.getUTCDate() + 6);
  return { chiave: `${anno}-W${String(w).padStart(2, '0')}`, da: iso(lun), a: iso(dom) };
}
function mese(id) {
  const d = giornoUtc(id), fine = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { chiave: id.slice(0, 7), da: `${id.slice(0, 7)}-01`, a: iso(fine) };
}

function raggruppa(per) {
  const m = new Map();
  for (const g of letti) { const p = per(g.id); (m.get(p.chiave) ?? m.set(p.chiave, { ...p, giorni: [] }).get(p.chiave)).giorni.push(g); }
  return [...m.values()];
}
function scrivi(sottocartella, gruppi) {
  mkdirSync(`${DIR}/${sottocartella}`, { recursive: true });
  const out = [];
  for (const g of gruppi) {
    if (g.a > ultimo) continue; // periodo ancora aperto
    const file = `${sottocartella}/${g.chiave}.csv`, righe = g.giorni.flatMap((x) => x.righe);
    writeFileSync(`${DIR}/${file}`, [g.giorni[0].testa, ...righe].join('\n') + '\n');
    out.push({ id: g.chiave, da: g.da, a: g.a, giorni: g.giorni.length, righe: righe.length, byte: statSync(`${DIR}/${file}`).size, file });
  }
  return out;
}

const sett = scrivi('settimane', raggruppa(settimana)), mesi = scrivi('mesi', raggruppa(mese));
const indice = {
  generatoAlle: new Date().toISOString(),
  colonne: letti[0].testa,
  giorni: letti.map((g) => ({ id: g.id, righe: g.righe.length, file: `${g.id.slice(0, 4)}/${g.id}.csv` })).reverse(),
  settimane: sett.reverse(),
  mesi: mesi.reverse(),
};
writeFileSync(`${DIR}/indice.json`, JSON.stringify(indice));
console.log(`giorni ${indice.giorni.length}, settimane ${sett.length}, mesi ${mesi.length}`);
