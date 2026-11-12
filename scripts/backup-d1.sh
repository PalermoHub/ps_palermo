#!/usr/bin/env bash
# Scarica da D1 (remoto) una copia locale dell'archivio grezzo o dell'intero database.
# Uso:  scripts/backup-d1.sh [grezzo|tutto] [cartella]
#   grezzo  (default)  solo la tabella `grezzo` (risposte originali delle fonti)
#   tutto              l'intero database (letture, grezzo, stato)
# Cartella di destinazione: $BACKUP_DIR oppure ~/backup-pronto-soccorso (fuori dal repo, di proposito).
# Istruzioni complete e ripristino: docs/backup-grezzo.md
set -euo pipefail

cd "$(dirname "$0")/.."
DB="palermo-ps-storico"
COSA="${1:-grezzo}"
DEST="${2:-${BACKUP_DIR:-$HOME/backup-pronto-soccorso}}"
FILE="$DEST/${COSA}-$(date +%Y-%m-%d_%H%M).sql"

case "$COSA" in
  grezzo) OPZ=(--table grezzo) ;;
  tutto)  OPZ=() ;;
  *) echo "Uso: $0 [grezzo|tutto] [cartella]" >&2; exit 2 ;;
esac

mkdir -p "$DEST"
npx wrangler d1 export "$DB" --remote "${OPZ[@]}" --output "$FILE"

# Controllo minimo: il file deve contenere righe e finire in modo sensato.
N=$(grep -c '^INSERT' "$FILE" || true)
if [ "$N" -eq 0 ]; then echo "ATTENZIONE: nessun INSERT nel dump, backup sospetto: $FILE" >&2; exit 1; fi

gzip -k -f "$FILE"
echo "OK: $N righe in $FILE ($(du -h "$FILE" | cut -f1)), copia compressa: $FILE.gz"
