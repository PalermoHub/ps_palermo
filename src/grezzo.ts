/** Archivio delle risposte originali delle fonti (tabella `grezzo`, migrazione 0002). */

export interface Cattura {
  fonte: string;
  chiave: string;
  /** Corpo originale; null se la richiesta è fallita prima di ottenerlo. */
  corpo: string | null;
  /** 'ok' | 'rete: ...' | 'parse: ...' */
  esito: string;
}

const GIORNI_OK = 7;
const GIORNI_ERRORI = 90;

async function flusso(dati: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = t.writable.getWriter();
  void w.write(dati as BufferSource).then(() => w.close());
  return new Uint8Array(await new Response(t.readable).arrayBuffer());
}

export const comprimi = (s: string) => flusso(new TextEncoder().encode(s), new CompressionStream('gzip'));
export const decomprimi = async (b: Uint8Array) => new TextDecoder().decode(await flusso(b, new DecompressionStream('gzip')));

export async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** D1 restituisce i BLOB come array di numeri o ArrayBuffer a seconda dell'ambiente. */
export function inBytes(v: unknown): Uint8Array | null {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  return null;
}

/**
 * Salva le catture il cui corpo (o errore) è diverso dall'ultima cattura della stessa fonte/chiave.
 * Restituisce quante righe ha scritto.
 *
 * L'ultima cattura si legge da `grezzo_ultimo` (una riga per fonte/chiave, migrazione 0006): interrogare
 * `grezzo` con `MAX(id) ... GROUP BY fonte, chiave` era un full scan della tabella a ogni giro.
 * `campione` = 1 sulla prima cattura `ok` del giorno: è quella che la potatura tiene per sempre.
 */
export async function archivia(db: D1Database, catture: Cattura[], adesso = new Date()): Promise<number> {
  if (catture.length === 0) return 0;
  const { results: ultimi } = await db
    .prepare('SELECT fonte, chiave, hash, esito, giorno FROM grezzo_ultimo')
    .all<{ fonte: string; chiave: string; hash: string | null; esito: string; giorno: string | null }>();
  const ultimo = new Map(ultimi.map((r) => [`${r.fonte}|${r.chiave}`, r]));
  const ts = Math.floor(adesso.getTime() / 1000);
  const giorno = adesso.toISOString().slice(0, 10);
  const ins = db.prepare('INSERT INTO grezzo (fonte, chiave, ts, hash, byte, corpo, esito, campione) VALUES (?,?,?,?,?,?,?,?)');
  // `giorno` avanza solo quando si conserva un campione: `COALESCE` lascia quello vecchio per le altre righe.
  const aggiorna = db.prepare('INSERT INTO grezzo_ultimo (fonte, chiave, hash, esito, giorno) VALUES (?,?,?,?,?) ON CONFLICT(fonte, chiave) DO UPDATE SET hash = excluded.hash, esito = excluded.esito, giorno = COALESCE(excluded.giorno, grezzo_ultimo.giorno)');

  const nuove = [];
  let scritte = 0;
  for (const c of catture) {
    const hash = c.corpo == null ? null : await sha256(c.corpo);
    const k = `${c.fonte}|${c.chiave}`;
    const u = ultimo.get(k);
    if (u && u.hash === hash && u.esito === c.esito) continue;
    const campione = c.esito === 'ok' && u?.giorno !== giorno ? 1 : 0;
    const gz = c.corpo == null ? null : await comprimi(c.corpo);
    const blob = gz ? gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) : null;
    nuove.push(ins.bind(c.fonte, c.chiave, ts, hash, c.corpo == null ? null : new TextEncoder().encode(c.corpo).length, blob, c.esito, campione));
    nuove.push(aggiorna.bind(c.fonte, c.chiave, hash, c.esito, campione ? giorno : null));
    // Se la stessa fonte/chiave comparisse due volte nello stesso giro, il confronto vale con l'ultima scritta.
    ultimo.set(k, { fonte: c.fonte, chiave: c.chiave, hash, esito: c.esito, giorno: campione ? giorno : (u?.giorno ?? null) });
    scritte++;
  }
  if (nuove.length) await db.batch(nuove);
  return scritte;
}

/**
 * Toglie le catture vecchie, ma conserva la prima `ok` di ogni fonte/chiave/giorno come campione permanente.
 * Il flag `campione` è già sulla riga (lo mette `archivia`), quindi i DELETE leggono solo le righe che
 * cancellano grazie all'indice su `ts`: prima erano due full scan di `grezzo` (altri 0,4 milioni di righe il 16/11).
 */
export async function pota(db: D1Database, adesso = new Date()): Promise<void> {
  const s = Math.floor(adesso.getTime() / 1000);
  await db.batch([
    db.prepare(`DELETE FROM grezzo WHERE esito = 'ok' AND campione = 0 AND ts < ?`).bind(s - GIORNI_OK * 86400),
    db.prepare(`DELETE FROM grezzo WHERE esito != 'ok' AND ts < ?`).bind(s - GIORNI_ERRORI * 86400),
  ]);
}

/** Corpo originale di una cattura, per rieseguire un parser. */
export async function leggi(db: D1Database, id: number): Promise<{ fonte: string; chiave: string; ts: number; esito: string; corpo: string | null } | null> {
  const r = await db.prepare('SELECT fonte, chiave, ts, esito, corpo FROM grezzo WHERE id = ?').bind(id).first<{ fonte: string; chiave: string; ts: number; esito: string; corpo: unknown }>();
  if (!r) return null;
  const b = inBytes(r.corpo);
  return { fonte: r.fonte, chiave: r.chiave, ts: r.ts, esito: r.esito, corpo: b ? await decomprimi(b) : null };
}
