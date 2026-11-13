/**
 * Controlla lo stato delle fonti e apre/chiude issue GitHub (label `allarme-dati`). Lanciato ogni 30 minuti da
 * .github/workflows/controllo-fonti.yml. Una issue per problema, aperta una sola volta e chiusa da sola quando rientra.
 *
 *   EXPORT_TOKEN=... GH_TOKEN=... GITHUB_REPOSITORY=org/repo npx vite-node scripts/controlla-fonti.ts
 * Prova senza GitHub:  STATO_FILE=stato.json DRY=1 npx vite-node scripts/controlla-fonti.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { problemi, type Problema, type StatoFonti } from '../src/allarmi';

const SITO = process.env.SITO || 'https://palermo-ps.coseerobe.workers.dev';
const DRY = process.env.DRY === '1';
const ETICHETTA = 'allarme-dati';

const gh = (...a: string[]): string => execFileSync('gh', a, { encoding: 'utf8' });

async function leggiStato(): Promise<StatoFonti | null> {
  if (process.env.STATO_FILE) return JSON.parse(readFileSync(process.env.STATO_FILE, 'utf8')) as StatoFonti;
  const token = process.env.EXPORT_TOKEN;
  if (!token) throw new Error('Imposta EXPORT_TOKEN (secret del repo)');
  // Un singolo intoppo di rete non è un allarme: 3 tentativi a 15 secondi.
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${SITO}/api/stato`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      if (r.ok) return (await r.json()) as StatoFonti;
      console.error(`/api/stato: HTTP ${r.status}`);
    } catch (e) { console.error(`/api/stato: ${e instanceof Error ? e.message : e}`); }
    if (i < 2) await new Promise((ok) => setTimeout(ok, 15_000));
  }
  return null;
}

/** Il backup notturno ha la sua issue, aperta e chiusa dal suo workflow: questo script non la tocca. */
const TITOLO_BACKUP = 'Allarme dati: backup notturno fallito';

const stato = await leggiStato();
const attivi: Problema[] = stato
  ? problemi(stato)
  : [{ chiave: 'sito', titolo: 'Allarme dati: il sito non risponde', dettaglio: `${SITO}/api/stato non risponde (o il token non è valido) per 3 tentativi consecutivi.` }];
console.log(`problemi attivi: ${attivi.length}${attivi.length ? ' → ' + attivi.map((p) => p.titolo).join('; ') : ''}`);
if (DRY) { for (const p of attivi) console.log(`[dry] aprirebbe/lascerebbe aperta: ${p.titolo}\n  ${p.dettaglio}`); process.exit(0); }

try { gh('label', 'create', ETICHETTA, '--color', 'd93f0b', '--description', 'Fonte ferma o dati non aggiornati (automatica)'); } catch { /* esiste già */ }
const aperte = JSON.parse(gh('issue', 'list', '--label', ETICHETTA, '--state', 'open', '--json', 'number,title', '--limit', '100')) as { number: number; title: string }[];
const titoliAttivi = new Set(attivi.map((p) => p.titolo));

for (const p of attivi) {
  if (aperte.some((i) => i.title === p.titolo)) continue; // già segnalato: niente spam
  const url = gh('issue', 'create', '--title', p.titolo, '--label', ETICHETTA, '--body', `${p.dettaglio}\n\nControllo automatico (${new Date().toISOString()}). L'issue si chiude da sola quando il problema rientra.\nStato completo: \`${SITO}/api/stato\` (serve il token) · pagina «Salute dei dati» nelle Analisi.`).trim();
  console.log(`aperta: ${url}`);
}
for (const i of aperte) {
  // Chiude solo le issue di questo controllo (titolo noto) il cui problema non c'è più.
  const nostra = i.title.startsWith('Allarme dati: ') && i.title !== TITOLO_BACKUP;
  if (!nostra || titoliAttivi.has(i.title)) continue;
  gh('issue', 'comment', String(i.number), '--body', `Rientrato: all'ultimo controllo (${new Date().toISOString()}) non risultano più problemi. Chiudo.`);
  gh('issue', 'close', String(i.number));
  console.log(`chiusa #${i.number}: ${i.title}`);
}
