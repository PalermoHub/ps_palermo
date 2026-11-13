# palermo-ps

Tempi di attesa dei Pronto Soccorso di **Palermo città**, letti ogni 5 minuti dalle fonti pubbliche degli ospedali, con mappa, schede per presidio, storico e analisi.
Stato: **in produzione** (Worker `palermo-ps` su Cloudflare, sito + API + storico + archivio CSV).

## Come funziona
Un **Cloudflare Worker** con cron ogni 5 minuti interroga 5 fonti, normalizza in `Lettura` (`src/types.ts`) e salva lo snapshot in **D1** (tabella `stato`). Lo stesso Worker serve l'API e il sito statico in `web/`.

- Il cron chiama `/api/refresh` tramite un binding a sé stesso (`SELF`): lo scraping parte da una richiesta, così rispetta il placement `aws:eu-south-1` (Milano). Riuniti e ARNAS Civico non rispondono a IP di datacenter esteri.
- Se una fonte cade resta l'ultima lettura buona con `acquisitaAlle` e `ultimoErrore`: un dato vecchio non passa mai per fresco (`src/freschezza.ts`). Fonti congelate e incoerenze sono segnalate (`src/coerenza.ts`, `src/salute.ts`).
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

## API
| Endpoint | Cosa restituisce |
|---|---|
| `GET /api/palermo` | Ultima lettura di ogni PS, con affidabilità e coerenza (cache 30 s) |
| `GET /api/storico` | Serie storiche per i grafici (cache in D1, 5 min) |
| `GET /api/salute` | Affidabilità delle fonti nelle ultime 24 ore (cache in D1, 5 min) |
| `GET /api/refresh` | Rinfresca lo snapshot se più vecchio di 270 s (usato dal cron) |
| `GET /api/export.csv?day=AAAA-MM-GG` | CSV di un giorno, **con token** (`EXPORT_TOKEN`) |
| `GET /api/grezzo[?id=N]` | Archivio delle risposte grezze, **con token** |

## Sito (`web/`)
- `index.html`: mappa Leaflet, schede per presidio, filtro adulti/pediatrico, riepilogo, pulsante 112 e disclaimer «non sostituisce il 118».
- `grafici.html`: analisi (presenti nelle ultime ore, fasce con meno gente, chi aspetta di più, permanenza, sovraffollamento, affidabilità dei dati), esportazione dei grafici in PNG e sezione **Scarica i dati** (CSV di giorni, settimane e mesi).
- Modalità embed per le pagine PalermoHub: vedi `docs/embed.md`.

## Storico e archivio CSV
- Ogni lettura finisce nel database D1 `palermo-ps-storico` (migrazioni in `migrations/`).
- `.github/workflows/backup-storico.yml` gira ogni notte (02:30 UTC): scarica il CSV di ieri in `dati/storico/AAAA/`, ricalcola `heatmap.json`, crea con `scripts/aggrega.mjs` i CSV di settimane e mesi chiusi e riscrive `indice.json`, poi fa commit e push. Il sito legge questi file da `raw.githubusercontent.com`, senza nuovo deploy (cache ~5 min). Le colonne sono descritte in `dati/storico/descrizione-colonne.csv`.
- Backup locale dell'archivio grezzo: `scripts/backup-d1.sh` (vedi `docs/backup-grezzo.md`).

## Comandi
`npm test` · `npm run typecheck` · `npm run dev` (anteprima locale su http://localhost:8787) · `npm run deploy`

## Deploy
`.github/workflows/deploy.yml`: a ogni push su `main` esegue typecheck e test, poi `wrangler deploy`.
Secret nel repo: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers"), `CLOUDFLARE_ACCOUNT_ID`, `EXPORT_TOKEN` (stesso del Worker, per il backup notturno).
Se l'Action non parte, il deploy si fa a mano con `npm run deploy`.

## Altra documentazione
`docs/`: `da-fare.md` (attività aperte), `audit-fonti.md`, `analisi-dati-e-grafici.md`, `diagnosi-dati-non-aggiornati.md`, `embed.md`, `backup-grezzo.md`.

## Da fare
1. Numeri di telefono dei presidi (`telefono` in `src/anagrafica.ts`, solo valori verificati): abilitano il pulsante «Chiama».
2. Verificare "Policlinico: `pazientiInCarico` = in trattamento" (assunzione, vedi commento in `policlinico.ts`).
3. Rilevazione Policlinico senza orario: mostrare solo la nostra ora di lettura.
4. Sezione PPI statica (Albanese, Casa del Sole) con orari da confermare con l'ASP.
5. Licenza: i repo originali non ne hanno una, qui nessun codice copiato (solo fonti pubbliche e anagrafica da ricontrollare); manca anche la licenza per il CSV di descrizione colonne.
6. Verificare ToS/robots delle fonti e fissare un `User-Agent` con contatto.
