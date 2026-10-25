#!/usr/bin/env bash
# Render every drawing in the art library (src/paper/art.tsx) to a small looping GIF in ../library/art/, for the
# studio's library sheet and for use anywhere else. Usage: scripts/art-gifs.sh [name ...]
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
  echo "== $n"
  npx remotion render "$bundle" ArtPreview "$out/$n.gif" --codec=gif --every-nth-frame=2 --props="{\"name\":\"$n\"}" --log=error
done
ls -la "$out" | tail -n +2 | awk '{s+=$5} END {print NR " gifs, " int(s/1024) " KB"}'
