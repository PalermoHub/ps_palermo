-- Colonne aggiuntive per non perdere i dati che il grezzo conserva solo 7 giorni (NULL = la fonte non li pubblica).
-- tot_/tratt_/oss_ = pazienti per codice in totale / in trattamento / in osservazione; tm_ = attesa media in minuti (solo Policlinico).
ALTER TABLE letture ADD COLUMN posti INTEGER;
ALTER TABLE letture ADD COLUMN perm_meno24h INTEGER;
ALTER TABLE letture ADD COLUMN perm_24_48h INTEGER;
ALTER TABLE letture ADD COLUMN perm_oltre48h INTEGER;
ALTER TABLE letture ADD COLUMN tot_rosso INTEGER;
ALTER TABLE letture ADD COLUMN tot_arancione INTEGER;
ALTER TABLE letture ADD COLUMN tot_azzurro INTEGER;
ALTER TABLE letture ADD COLUMN tot_verde INTEGER;
ALTER TABLE letture ADD COLUMN tot_bianco INTEGER;
ALTER TABLE letture ADD COLUMN tratt_rosso INTEGER;
ALTER TABLE letture ADD COLUMN tratt_arancione INTEGER;
ALTER TABLE letture ADD COLUMN tratt_azzurro INTEGER;
ALTER TABLE letture ADD COLUMN tratt_verde INTEGER;
ALTER TABLE letture ADD COLUMN tratt_bianco INTEGER;
ALTER TABLE letture ADD COLUMN oss_rosso INTEGER;
ALTER TABLE letture ADD COLUMN oss_arancione INTEGER;
ALTER TABLE letture ADD COLUMN oss_azzurro INTEGER;
ALTER TABLE letture ADD COLUMN oss_verde INTEGER;
ALTER TABLE letture ADD COLUMN oss_bianco INTEGER;
ALTER TABLE letture ADD COLUMN tm_rosso REAL;
ALTER TABLE letture ADD COLUMN tm_arancione REAL;
ALTER TABLE letture ADD COLUMN tm_azzurro REAL;
ALTER TABLE letture ADD COLUMN tm_verde REAL;
ALTER TABLE letture ADD COLUMN tm_bianco REAL;
