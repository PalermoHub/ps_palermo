-- Una riga per presidio a ogni rilevazione valida (ts = secondi unix UTC, arrotondati al minuto).
-- NULL = la fonte non pubblica quel dato (mai 0 inventato).
CREATE TABLE IF NOT EXISTS letture (
  ps_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  in_attesa INTEGER,
  totale INTEGER,
  sovraff REAL,
  att_rosso INTEGER,
  att_arancione INTEGER,
  att_azzurro INTEGER,
  att_verde INTEGER,
  att_bianco INTEGER,
  PRIMARY KEY (ps_id, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS letture_ts ON letture (ts);
