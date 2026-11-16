-- Media di `in_attesa` per presidio e mezz'ora (bucket = ts / 1800, secondi unix UTC).
-- `costruisciStorico` leggeva due settimane di `letture` grezze a ogni ricalcolo (28.400 righe per giro,
-- 100 giri il 16/11/2026 = 2,8 milioni di righe lette, il 54% del limite giornaliero del piano Free).
-- Da qui legge un numero di righe fissato dalla finestra (672 mezze ore × 8 presidi) e non dalla
-- dimensione della tabella. La riga del bucket corrente si ricalcola a ogni lettura salvata, quindi è idempotente.
CREATE TABLE IF NOT EXISTS mezzora (
  ps_id TEXT NOT NULL,
  b INTEGER NOT NULL,      -- ts / 1800
  somma REAL NOT NULL,     -- somma di in_attesa nel bucket
  n INTEGER NOT NULL,      -- quante letture (con in_attesa non nullo) nel bucket
  PRIMARY KEY (ps_id, b)
) WITHOUT ROWID;

-- `costruisciStorico` legge per intervallo di bucket: senza questo indice sarebbe un full scan.
CREATE INDEX IF NOT EXISTS mezzora_b ON mezzora (b);

-- Riempimento (idempotente) dalle letture già salvate.
INSERT INTO mezzora (ps_id, b, somma, n)
SELECT ps_id, CAST(ts / 1800 AS INTEGER), SUM(in_attesa), COUNT(*)
FROM letture WHERE in_attesa IS NOT NULL
GROUP BY ps_id, CAST(ts / 1800 AS INTEGER)
ON CONFLICT(ps_id, b) DO UPDATE SET somma = excluded.somma, n = excluded.n;
