#!/usr/bin/env bash
# Copie le module commun ocr-core dans un site (ou vérifie qu'il est identique).
#
#   ./ocr-core/sync.sh <racine-du-site>            copie backend + frontend
#   ./ocr-core/sync.sh --check <racine-du-site>    vérifie sans rien modifier
#
# Emplacements dans chaque site (identiques pour tous) :
#   backend/ocr_core/                      ← ocr-core/backend/ocr_core/
#   frontend/src/components/ocr-core/      ← ocr-core/frontend/ocr-core/
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK=0
if [ "${1:-}" = "--check" ]; then CHECK=1; shift; fi
SITE="${1:?Usage : sync.sh [--check] <racine-du-site>}"

BACK_SRC="$HERE/backend/ocr_core"
FRONT_SRC="$HERE/frontend/ocr-core"
BACK_DST="$SITE/backend/ocr_core"
FRONT_DST="$SITE/frontend/src/components/ocr-core"

if [ "$CHECK" = 1 ]; then
  status=0
  diff -r -x '__pycache__' "$BACK_SRC" "$BACK_DST" >/dev/null 2>&1 || { echo "backend  : DIFFÉRENT de ocr-core $(cat "$HERE/VERSION")"; status=1; }
  diff -r "$FRONT_SRC" "$FRONT_DST" >/dev/null 2>&1 || { echo "frontend : DIFFÉRENT de ocr-core $(cat "$HERE/VERSION")"; status=1; }
  [ "$status" = 0 ] && echo "identique à ocr-core $(cat "$HERE/VERSION")"
  exit "$status"
fi

rm -rf "$BACK_DST" "$FRONT_DST"
mkdir -p "$BACK_DST" "$FRONT_DST"
cp -R "$BACK_SRC"/. "$BACK_DST"/
cp -R "$FRONT_SRC"/. "$FRONT_DST"/
find "$BACK_DST" -name '__pycache__' -type d -prune -exec rm -rf {} +
echo "ocr-core $(cat "$HERE/VERSION") copié dans $SITE"
