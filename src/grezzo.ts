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
 */
export async function archivia(db: D1Database, catture: Cattura[], adesso = new Date()): Promise<number> {
  if (catture.length === 0) return 0;
  const { results: ultimi } = await db
    .prepare('SELECT fonte, chiave, hash, esito FROM grezzo WHERE id IN (SELECT MAX(id) FROM grezzo GROUP BY fonte, chiave)')
    .all<{ fonte: string; chiave: string; hash: string | null; esito: string }>();
  const ultimo = new Map(ultimi.map((r) => [`${r.fonte}|${r.chiave}`, r]));
  const ts = Math.floor(adesso.getTime() / 1000);
  const ins = db.prepare('INSERT INTO grezzo (fonte, chiave, ts, hash, byte, corpo, esito) VALUES (?,?,?,?,?,?,?)');

  const nuove = [];
  for (const c of catture) {
    const hash = c.corpo == null ? null : await sha256(c.corpo);
    const u = ultimo.get(`${c.fonte}|${c.chiave}`);
    if (u && u.hash === hash && u.esito === c.esito) continue;
    const gz = c.corpo == null ? null : await comprimi(c.corpo);
    const blob = gz ? gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) : null;
    nuove.push(ins.bind(c.fonte, c.chiave, ts, hash, c.corpo == null ? null : new TextEncoder().encode(c.corpo).length, blob, c.esito));
  }
  if (nuove.length) await db.batch(nuove);
  return nuove.length;
}

/** Toglie le catture vecchie, ma conserva la prima di ogni fonte/chiave/giorno come campione permanente. */
export async function pota(db: D1Database, adesso = new Date()): Promise<void> {
  const s = Math.floor(adesso.getTime() / 1000);
  await db.batch([
    db.prepare(`DELETE FROM grezzo WHERE esito = 'ok' AND ts < ? AND id NOT IN (SELECT MIN(id) FROM grezzo WHERE esito = 'ok' GROUP BY fonte, chiave, ts / 86400)`).bind(s - GIORNI_OK * 86400),
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
