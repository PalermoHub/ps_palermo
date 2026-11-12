-- Risposte originali delle fonti, così i parser si possono rieseguire sul passato.
-- Si salva solo quando il corpo cambia rispetto all'ultima cattura (stesso hash = nulla di nuovo).
-- Le catture ok più vecchie di 7 giorni sono potate, tranne la prima di ogni fonte/chiave/giorno; gli errori restano 90 giorni.
CREATE TABLE IF NOT EXISTS grezzo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL,
  chiave TEXT NOT NULL,
  ts INTEGER NOT NULL,   -- secondi unix UTC della cattura
  hash TEXT,             -- sha256 del corpo; NULL se non c'è corpo (errore di rete)
  byte INTEGER,          -- lunghezza del corpo non compresso
  corpo BLOB,            -- gzip; NULL se errore di rete
  esito TEXT NOT NULL    -- 'ok' | 'rete: ...' | 'parse: ...'
);
CREATE INDEX IF NOT EXISTS grezzo_fonte ON grezzo (fonte, chiave, ts);
