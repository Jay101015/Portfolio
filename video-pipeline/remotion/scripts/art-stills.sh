#!/usr/bin/env bash
# Render every drawing in the art library, finished, to a transparent PNG in ../library/art/ (for thumbnails and
# previews in the studio). Usage: scripts/art-stills.sh [name ...]
set -euo pipefail
cd "$(dirname "$0")/.."
out="../library/art"
mkdir -p "$out"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  mapfile -t names < <({ grep -oE "^  '?[a-z0-9-]+'?: \{$" src/paper/art.tsx | sed -E "s/^  '?([a-z0-9-]+)'?: \{$/\1/"; python3 -c "import json,os; m='../library/illus/manifest.json'; print('\n'.join(e['name'] for e in json.load(open(m)) if not e['name'].startswith('trial-'))) if os.path.exists(m) else None"; } | sed '/^$/d')
fi
bundle="${TMPDIR:-/tmp}/mm-art-bundle"
npx remotion bundle src/index.ts --out-dir="$bundle" --log=error
for n in "${names[@]}"; do
  npx remotion still "$bundle" ArtStill "$out/$n.png" --image-format=png --props="{\"name\":\"$n\"}" --log=error
done
ls "$out"/*.png | wc -l
