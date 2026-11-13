# palermo-ps

Tempi di attesa dei Pronto Soccorso di **Palermo città**, letti ogni 5 minuti dalle fonti pubbliche degli ospedali, con mappa, schede per presidio, storico e analisi.
Stato: **in produzione** (Worker `palermo-ps` su Cloudflare, sito + API + storico + archivio CSV).

## Come funziona
Un **Cloudflare Worker** con cron ogni 5 minuti interroga 5 fonti, normalizza in `Lettura` (`src/types.ts`) e salva lo snapshot in **D1** (tabella `stato`). Lo stesso Worker serve l'API e il sito statico in `web/`.

- Il cron chiama `/api/refresh` tramite un binding a sé stesso (`SELF`): lo scraping parte da una richiesta, così rispetta il placement `aws:eu-south-1` (Milano). Riuniti e ARNAS Civico non rispondono a IP di datacenter esteri.
- Se una fonte cade resta l'ultima lettura buona con `acquisitaAlle` e `ultimoErrore`: un dato vecchio non passa mai per fresco (`src/freschezza.ts`). Fonti congelate e incoerenze sono segnalate (`src/coerenza.ts`, `src/salute.ts`).
- Gli endpoint `/api/*` pubblici sono pensati per il sito: rispondono solo a richieste della stessa origine o di `palermohub.opendatasicilia.it` e `siciliahub.github.io` (con CORS), con un limite di 30 richieste al minuto per IP (`src/origine.ts`, binding `LIMITE` in `wrangler.toml`). Export CSV e archivio grezzo richiedono `EXPORT_TOKEN`.
- Ogni risposta grezza delle fonti è archiviata (`src/grezzo.ts`), così i parser si possono rieseguire sul passato. Le catture `ok` più vecchie di 7 giorni sono potate (resta la prima per fonte/chiave/giorno), gli errori restano 90 giorni.

| Fonte | Formato | PS | File |
|---|---|---|---|
| Ospedali Riuniti | HTML (classi CSS) | Villa Sofia, Cervello adulti, Cervello pediatrico | `src/sources/riuniti.ts` |
| ARNAS Civico | HTML + testo | Civico, Di Cristina | `src/sources/civico.ts` |
| Policlinico | JSON (2 endpoint) | Policlinico | `src/sources/policlinico.ts` |
| ASP Palermo | HTML | Ingrassia | `src/sources/asp.ts` |
| Fatebenefratelli | JSON (POST) | Buccheri La Ferla | `src/sources/buccheri.ts` |

Regola dei dati: se la fonte non pubblica un valore è `null`, mai `0` inventato né totali calcolati da noi
(eccezione dichiarata: `pazientiTotali` Buccheri/Policlinico e `sovraffollamentoPct` Policlinico).

## Sito (`web/`)
- `index.html`: mappa Leaflet, schede per presidio, filtro adulti/pediatrico, riepilogo, pulsante 112 e disclaimer «non sostituisce il 118».
- `grafici.html`: analisi (presenti nelle ultime ore, fasce con meno gente, chi aspetta di più, permanenza, sovraffollamento, affidabilità dei dati), esportazione dei grafici in PNG e sezione **Scarica i dati** (CSV di giorni, settimane e mesi).
- `privacy.html`: informativa (cosa resta nel browser, posizione, servizi di terzi). I font (Archivo, Figtree) sono in `web/fonts/`, senza richieste a Google Fonts. Restano esterni solo le librerie su cdnjs/jsDelivr, le mappe (OpenFreeMap/OSM) e i CSV su GitHub: se ne cambi uno, aggiorna l'informativa.
- Modalità embed per le pagine PalermoHub: vedi `docs/embed.md`.

## Storico e archivio CSV
- Ogni lettura finisce nel database D1 `palermo-ps-storico` (migrazioni in `migrations/`).
- `.github/workflows/backup-storico.yml` gira ogni notte (02:30 UTC): scarica il CSV di ieri in `dati/storico/AAAA/`, ricalcola `heatmap.json`, crea con `scripts/aggrega.mjs` i CSV di settimane e mesi chiusi e riscrive `indice.json`, poi fa commit e push. Il sito legge questi file da `raw.githubusercontent.com`, senza nuovo deploy (cache ~5 min). Le colonne sono descritte in `dati/storico/descrizione-colonne.csv`.
- Backup locale dell'archivio grezzo: `scripts/backup-d1.sh` (vedi `docs/backup-grezzo.md`).

## Allarmi
`.github/workflows/controllo-fonti.yml` (ogni 30 minuti) legge `/api/stato` (serve `EXPORT_TOKEN`) e apre una **issue** con label `allarme-dati` se una fonte è irraggiungibile da almeno 30 minuti, ferma («congelata») o vecchia, se il Worker non aggiorna da oltre 20 minuti o se il sito non risponde. L'issue si chiude da sola quando il problema rientra. Anche il backup notturno apre e chiude la sua issue. Le regole sono in `src/allarmi.ts`. Per ricevere l'email, metti il repo in «Watch» su GitHub.

## Comandi
`npm test` · `npm run typecheck` · `npm run dev` (anteprima locale su http://localhost:8787) · `npm run deploy`

## Deploy
`.github/workflows/deploy.yml`: a ogni push su `main` esegue typecheck e test, poi `wrangler deploy`.
Secret nel repo: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers"), `CLOUDFLARE_ACCOUNT_ID`, `EXPORT_TOKEN` (stesso del Worker, per il backup notturno).
Se l'Action non parte, il deploy si fa a mano con `npm run deploy`.

## Licenze
Copyright © 2026 OpenDataSicilia.
- **Codice** (`src/`, `web/`, `scripts/`, `test/`): [MIT](LICENSE).
- **Dati** (`dati/`): [CC BY 4.0](dati/LICENZA.md), da citare come «Pronto Soccorso Palermo (#opendatasicilia), CC BY 4.0». I numeri di partenza restano degli enti che li pubblicano.

## Altra documentazione
`docs/`: `da-fare.md` (attività aperte), `audit-fonti.md`, `analisi-dati-e-grafici.md`, `diagnosi-dati-non-aggiornati.md`, `embed.md`, `backup-grezzo.md`.

## Da fare
Lista unica e aggiornata in [`docs/da-fare.md`](docs/da-fare.md) (priorità, cose da sapere prima di ripartire).
