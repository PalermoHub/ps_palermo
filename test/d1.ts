import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Vite non riconosce `node:sqlite` come builtin: lo carichiamo a mano.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/** Mini D1 sopra SQLite reale (node:sqlite): esegue le migrazioni vere, così i test provano l'SQL vero. */
export function d1Finto(migrazioni: string[]): D1Database {
  const db = new DatabaseSync(':memory:');
  for (const m of migrazioni) db.exec(readFileSync(new URL(`../migrations/${m}`, import.meta.url), 'utf8'));
  const conv = (v: unknown) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
  const prepara = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => prepara(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args.map(conv) as never[])) }),
    first: async () => db.prepare(sql).get(...(args.map(conv) as never[])) ?? null,
    run: async () => { db.prepare(sql).run(...(args.map(conv) as never[])); return {}; },
  });
  return {
    prepare: (sql: string) => prepara(sql),
    batch: async (st: { run(): Promise<unknown> }[]) => { for (const s of st) await s.run(); return []; },
  } as unknown as D1Database;
}
