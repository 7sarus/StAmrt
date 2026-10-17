#!/usr/bin/env bash
# Assemble the loadable Firefox add-on in addons/firefox/ and refresh its theme.
#
#   ./build-addon.sh          prepare the unpacked add-on
#   ./build-addon.sh --zip    also produce addons/stamrt-firefox.xpi
#
# Then load it via about:debugging → This Firefox → Load Temporary Add-on →
# pick addons/firefox/manifest.json.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
addon="$root/addons/firefox"

for file in index.html style.css app.js db.js; do
    cp "$root/$file" "$addon/$file"
done

# Regenerate theme.css for both the page and the add-on. The add-on copy gets
# the wallpaper copied inside it, since a moz-extension page cannot load
# file:// images.
"$root/noctalia/stamrt-theme.py" --addon "$addon"

echo "add-on ready: $addon"

if [[ "${1:-}" == "--zip" ]]; then
    out="$root/addons/stamrt-firefox.xpi"
    rm -f "$out"
    (cd "$addon" && zip -qr "$out" . -x '*.tmp')
    echo "packaged: $out"
fi
