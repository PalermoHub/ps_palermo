# palermo-ps

Tempi di attesa dei Pronto Soccorso di **Palermo città**, letti dalle fonti pubbliche degli ospedali.
Stato: **scheletro** (parser testati su risposte reali, Worker con cron, nessun frontend, nessun archivio storico).

## Come funziona
Un **Cloudflare Worker** (stesso approccio del digital twin di Palermo) con cron ogni 5 minuti interroga 5 fonti, normalizza in `Lettura` (`src/types.ts`) e salva uno snapshot in KV. Lo stesso Worker serve `GET /api/palermo` e il sito statico in `web/`. Se una fonte cade resta l'ultima lettura buona con `acquisitaAlle` e `ultimoErrore`: un dato vecchio non passa mai per fresco.

| Fonte | Formato | PS | File |
|---|---|---|---|
| Ospedali Riuniti | HTML (classi CSS) | Villa Sofia, Cervello adulti, Cervello pediatrico | `src/sources/riuniti.ts` |
| ARNAS Civico | HTML + testo | Civico, Di Cristina | `src/sources/civico.ts` |
| Policlinico | JSON (2 endpoint) | Policlinico | `src/sources/policlinico.ts` |
| ASP Palermo | HTML | Ingrassia | `src/sources/asp.ts` |
| Fatebenefratelli | JSON (POST) | Buccheri La Ferla | `src/sources/buccheri.ts` |

Regola dei dati: se la fonte non pubblica un valore è `null`, mai `0` inventato né totali calcolati da noi
(eccezione dichiarata: `pazientiTotali` Buccheri/Policlinico e `sovraffollamentoPct` Policlinico).

## Comandi
`npm test` · `npm run typecheck` · `npm run dev` (anteprima locale su http://localhost:8787) · `npm run deploy`

## Su GitHub
`.github/workflows/deploy.yml`: a ogni push su `main` esegue typecheck e test, poi `wrangler deploy`.
Secret da impostare nel repo: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") e `CLOUDFLARE_ACCOUNT_ID`.
Il namespace KV `PS_KV` è già creato e il suo id è in `wrangler.toml`.

## Da fare
1. Verificare "Policlinico: `pazientiInCarico` = in trattamento" (assunzione, vedi commento in `policlinico.ts`).
2. Rilevazione Policlinico senza orario: mostrare solo la nostra ora di lettura.
3. Storico (Supabase: tabella `letture`) per tendenze per fascia oraria.
4. Frontend: mappa Leaflet, ordinamento per distanza/carico, filtro adulti/pediatrico, disclaimer "non sostituisce il 118".
5. Sezione PPI statica (Albanese, Casa del Sole) con orari da confermare con l'ASP.
6. Licenza dei repo originali assente: qui nessun codice copiato, solo fonti pubbliche e anagrafica da ricontrollare.
7. Verificare ToS/robots delle fonti e fissare un `User-Agent` con contatto.
