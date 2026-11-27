#!/usr/bin/env bash
# Fetches the reference images (docs/REFERENCES.md) into refs/, which git ignores.
# The brief's own frames (refs/concept/) came with it and are copied by hand.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p refs

for pair in elden-ring:1245620 misery:2119830 stalker2:1643320 metro-exodus:412020 \
  chernobylite:1016800 pathologic2:505230 atomic-heart:668580; do
  name=${pair%%:*} app=${pair##*:} i=0
  mkdir -p "refs/$name"
  for u in $(curl -s "https://store.steampowered.com/api/appdetails?appids=$app" |
    jq -r ".\"$app\".data.screenshots[].path_full" | head -10); do
    i=$((i + 1))
    curl -sL "$u" -o "refs/$name/$name-$i.jpg"
  done
done

mkdir -p refs/gta6-hud
curl -sL https://www.technerdiness.com/wp-content/uploads/2026/10/GTA-6-HUD-Explained.jpg -o refs/gta6-hud/gta6-hud-1.jpg
curl -sL https://i.imgur.com/fLlPBQp.png -o refs/gta6-hud/gta6-hud-5.png
curl -sL https://i.imgur.com/Fpp12Ev.png -o refs/gta6-hud/gta6-hud-6.png
