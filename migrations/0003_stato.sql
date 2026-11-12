-- Stato interno del Worker (ultimo snapshot e lock del rinfresco).
-- Era su KV: il cron ogni 2 minuti superava le 1000 scritture/giorno del piano Free.
CREATE TABLE IF NOT EXISTS stato (
  chiave TEXT PRIMARY KEY,
  valore TEXT,
  ts INTEGER NOT NULL   -- millisecondi unix UTC dell'ultima scrittura
);
