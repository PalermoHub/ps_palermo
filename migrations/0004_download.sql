-- Contatore dei download dei CSV dell'archivio: una riga per file, quindi la tabella cresce solo con i file (non con i download).
CREATE TABLE IF NOT EXISTS download (
  file TEXT PRIMARY KEY,   -- percorso come nell'indice, es. 2026/2026-11-12.csv
  n INTEGER NOT NULL,      -- numero di download
  primo INTEGER NOT NULL,  -- millisecondi unix UTC del primo
  ultimo INTEGER NOT NULL  -- millisecondi unix UTC dell'ultimo
);
