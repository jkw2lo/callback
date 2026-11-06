#!/bin/sh
# Rebuilds callback-extension.zip, the download offered under the board's ⋮ menu.
# Run it after changing anything in extension/. The tests fail if the zip is out of date.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$root/extension" "$tmp/callback-extension"
rm -f "$root/callback-extension.zip"
(cd "$tmp" && zip -qrX "$root/callback-extension.zip" callback-extension -x '*.DS_Store')
