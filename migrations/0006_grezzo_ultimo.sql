-- Ultima cattura per fonte/chiave: `archivia` la legge al posto di
-- `SELECT MAX(id) FROM grezzo GROUP BY fonte, chiave`, che non può usare l'indice (fonte, chiave, ts)
-- e quindi era un full scan di `grezzo` a ogni giro del cron (il 16/11/2026: 2,5 milioni di righe
-- lette, il 47% del limite giornaliero del piano Free) e cresceva ogni giorno con l'archivio.
-- `giorno` = ultimo giorno UTC in cui si è conservato un campione `ok` (la prima cattura del giorno,
-- quella che la potatura tiene per sempre).
CREATE TABLE IF NOT EXISTS grezzo_ultimo (
  fonte TEXT NOT NULL,
  chiave TEXT NOT NULL,
  hash TEXT,
  esito TEXT NOT NULL,
  giorno TEXT,
  PRIMARY KEY (fonte, chiave)
) WITHOUT ROWID;

-- La potatura segna «tieni» con un flag invece di ricalcolare `MIN(id)` per ogni fonte/chiave/giorno
-- (l'altro full scan). Va deciso quando si scrive: `archivia` sa già se è la prima cattura ok del giorno.
ALTER TABLE grezzo ADD COLUMN campione INTEGER NOT NULL DEFAULT 0;

-- Serve a `pota` per leggere solo le righe che cancella, non tutta la tabella.
CREATE INDEX IF NOT EXISTS grezzo_ts ON grezzo (ts);

-- Riempimento per le catture già presenti, in due passi e idempotente (si può rilanciare senza danni).
UPDATE grezzo SET campione = 1
WHERE id IN (SELECT MIN(id) FROM grezzo WHERE esito = 'ok' GROUP BY fonte, chiave, ts / 86400);

INSERT OR REPLACE INTO grezzo_ultimo (fonte, chiave, hash, esito, giorno)
SELECT g.fonte, g.chiave, g.hash, g.esito,
       (SELECT date(MAX(c.ts), 'unixepoch') FROM grezzo c WHERE c.campione = 1 AND c.fonte = g.fonte AND c.chiave = g.chiave)
FROM grezzo g
WHERE g.id IN (SELECT MAX(id) FROM grezzo GROUP BY fonte, chiave);
