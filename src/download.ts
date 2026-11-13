/** Contatore dei download dei CSV dell'archivio (i file stanno su GitHub: il sito avvisa il Worker, che conta). */

const PRIMO_ANNO = 2026;

/**
 * True se `file` è un CSV che può esistere nell'archivio (stessi nomi di scripts/aggrega.mjs).
 * Serve a non creare righe arbitrarie in D1: i nomi possibili sono finiti e legati alla data di oggi.
 */
export function fileValido(file: string, adesso = new Date()): boolean {
  if (file === 'descrizione-colonne.csv') return true;
  const oggi = adesso.toISOString().slice(0, 10);
  const anno = adesso.getUTCFullYear();
  let m = /^(\d{4})\/(\d{4})-(\d{2})-(\d{2})\.csv$/.exec(file); // giorno
  if (m) {
    const [, a, a2, mm, gg] = m;
    const d = `${a2}-${mm}-${gg}`;
    return a === a2 && Number(a) >= PRIMO_ANNO && d <= oggi && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  }
  m = /^settimane\/(\d{4})-W(\d{2})\.csv$/.exec(file);
  if (m) return Number(m[1]) >= PRIMO_ANNO && Number(m[1]) <= anno && Number(m[2]) >= 1 && Number(m[2]) <= 53;
  m = /^mesi\/(\d{4})-(\d{2})\.csv$/.exec(file);
  if (m) return Number(m[1]) >= PRIMO_ANNO && Number(m[1]) <= anno && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  return false;
}

export async function contaDownload(db: D1Database, file: string, ora = Date.now()): Promise<void> {
  await db.prepare('INSERT INTO download (file, n, primo, ultimo) VALUES (?1, 1, ?2, ?2) ON CONFLICT(file) DO UPDATE SET n = n + 1, ultimo = ?2').bind(file, ora).run();
}

export async function conteggiDownload(db: D1Database): Promise<{ file: string; n: number; primo: string; ultimo: string }[]> {
  const { results } = await db.prepare('SELECT file, n, primo, ultimo FROM download ORDER BY n DESC, file').all<{ file: string; n: number; primo: number; ultimo: number }>();
  return results.map((r) => ({ file: r.file, n: r.n, primo: new Date(r.primo).toISOString(), ultimo: new Date(r.ultimo).toISOString() }));
}
