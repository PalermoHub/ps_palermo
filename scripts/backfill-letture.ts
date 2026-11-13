/**
 * Riempie le colonne aggiunte dalla migrazione 0005 sulle righe di `letture` già scritte,
 * rieseguendo i parser sull'archivio `grezzo` (che tiene le catture `ok` solo 7 giorni: lanciarlo prima della potatura).
 *
 *   EXPORT_TOKEN=... npx vite-node scripts/backfill-letture.ts            # scrive backfill.sql (nessuna modifica al database)
 *   npx wrangler d1 execute palermo-ps-storico --remote --file backfill.sql   # lo applica
 *
 * Sicurezza: una riga si aggiorna solo se il parser, rieseguito sulla cattura giusta, riproduce gli stessi `in_attesa`,
 * `totale` e `sovraff` già salvati; altrimenti è saltata e conteggiata (mai dati attribuiti a un momento sbagliato).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { FONTE_DI_PS } from '../src/aggiorna';
import { FONTI } from '../src/registry';
import { COLONNE, valoriLettura } from '../src/storico';

const SITO = process.env.SITO || 'https://palermo-ps.coseerobe.workers.dev';
const TOKEN = process.env.EXPORT_TOKEN;
if (!TOKEN) throw new Error('Imposta EXPORT_TOKEN');
/** La cattura è salvata subito dopo la lettura: tolleranza tra il minuto della riga e il tempo della cattura. */
const TOLLERANZA_S = 180;

const d1 = <T>(sql: string): T[] => {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'palermo-ps-storico', '--remote', '--json', '--command', sql], { encoding: 'utf8', maxBuffer: 256 << 20 });
  return JSON.parse(out)[0].results as T[];
};

const caps = d1<{ id: number; fonte: string; chiave: string; ts: number }>("SELECT id, fonte, chiave, ts FROM grezzo WHERE esito = 'ok' ORDER BY fonte, chiave, ts");
const righe = d1<Record<string, number | string | null>>('SELECT ps_id, ts, in_attesa, totale, sovraff FROM letture ORDER BY ts');
console.log(`catture ok: ${caps.length}, righe di letture: ${righe.length}`);

const corpi = new Map<number, string>();
async function corpo(id: number): Promise<string> {
  const c = corpi.get(id);
  if (c != null) return c;
  const r = await fetch(`${SITO}/api/grezzo?id=${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`grezzo ${id}: HTTP ${r.status}`);
  const t = await r.text();
  corpi.set(id, t);
  return t;
}

const sql: string[] = [];
let aggiornate = 0, saltate = 0, senzaCattura = 0;
const cache = new Map<string, Map<string, ReturnType<(typeof FONTI)[number]['parse']>[number]>>();

for (const r of righe) {
  const fonte = FONTI.find((f) => f.id === FONTE_DI_PS[String(r.ps_id)]);
  if (!fonte) continue;
  const ts = Number(r.ts);
  // Per ogni richiesta della fonte: l'ultima cattura ok non successiva alla riga (più la tolleranza).
  const scelte = fonte.richieste.map((q) => caps.filter((c) => c.fonte === fonte.id && c.chiave === q.chiave && c.ts <= ts + TOLLERANZA_S).at(-1));
  if (scelte.some((s) => !s)) { senzaCattura++; continue; }
  const k = scelte.map((s) => s!.id).join('+');
  if (!cache.has(k)) {
    // Gli errori di rete/token fermano lo script; solo un parser che fallisce su una cattura vecchia viene tollerato.
    const testi = await Promise.all(scelte.map((s) => corpo(s!.id)));
    try {
      cache.set(k, new Map(fonte.parse(testi).map((x) => [x.psId, x])));
    } catch { cache.set(k, new Map()); }
  }
  const l = cache.get(k)!.get(String(r.ps_id));
  const uguale = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  if (!l || !uguale(l.inAttesa, r.in_attesa) || !uguale(l.pazientiTotali, r.totale) || !uguale(l.sovraffollamentoPct, r.sovraff)) { saltate++; continue; }
  const nuove = COLONNE.slice(10), v = valoriLettura(l).slice(8);
  sql.push(`UPDATE letture SET ${nuove.map((c, i) => `${c}=${v[i] == null ? 'NULL' : v[i]}`).join(',')} WHERE ps_id='${r.ps_id}' AND ts=${ts};`);
  aggiornate++;
}
writeFileSync('backfill.sql', sql.join('\n') + '\n');
console.log(`da aggiornare: ${aggiornate}, saltate (valori diversi o parse fallito): ${saltate}, senza cattura: ${senzaCattura} -> backfill.sql`);
