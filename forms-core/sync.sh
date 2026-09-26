#!/usr/bin/env bash
# Copie le module commun forms-core dans un site (ou vérifie qu'il est identique).
#
#   ./forms-core/sync.sh <racine-du-site>            copie backend + frontend
#   ./forms-core/sync.sh --check <racine-du-site>    vérifie sans rien modifier
#
# Emplacements dans chaque site (identiques pour tous) :
#   backend/forms_core/                      ← forms-core/backend/forms_core/
#   frontend/src/components/forms-core/      ← forms-core/frontend/forms-core/
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK=0
if [ "${1:-}" = "--check" ]; then CHECK=1; shift; fi
SITE="${1:?Usage : sync.sh [--check] <racine-du-site>}"

BACK_SRC="$HERE/backend/forms_core"
FRONT_SRC="$HERE/frontend/forms-core"
BACK_DST="$SITE/backend/forms_core"
FRONT_DST="$SITE/frontend/src/components/forms-core"

if [ "$CHECK" = 1 ]; then
  status=0
  diff -r -x '__pycache__' "$BACK_SRC" "$BACK_DST" >/dev/null 2>&1 || { echo "backend  : DIFFÉRENT de forms-core $(cat "$HERE/VERSION")"; status=1; }
  diff -r "$FRONT_SRC" "$FRONT_DST" >/dev/null 2>&1 || { echo "frontend : DIFFÉRENT de forms-core $(cat "$HERE/VERSION")"; status=1; }
  [ "$status" = 0 ] && echo "identique à forms-core $(cat "$HERE/VERSION")"
  exit "$status"
fi

rm -rf "$BACK_DST" "$FRONT_DST"
mkdir -p "$BACK_DST" "$FRONT_DST"
cp -R "$BACK_SRC"/. "$BACK_DST"/
cp -R "$FRONT_SRC"/. "$FRONT_DST"/
find "$BACK_DST" -name '__pycache__' -type d -prune -exec rm -rf {} +
echo "forms-core $(cat "$HERE/VERSION") copié dans $SITE"
