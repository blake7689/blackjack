#!/usr/bin/env bash
# Waits until the live site serves the build this run made (#190): SWA swaps the new build in after the deploy
# job ends, so the post-deploy smoke test would otherwise run the new test against the old build.
# Reads the entry script path (e.g. /assets/index-Bb7oA3x7.js) from the local dist/index.html and polls the site
# until its index.html names the same file. The build is deterministic, so the hash matches what was deployed.
# SITE_URL, DIST_INDEX, WAIT_TIMEOUT (s) and WAIT_INTERVAL (s) exist for tests.
set -u

site="${SITE_URL:-https://blakejack.win}"
index="${DIST_INDEX:-dist/index.html}"
limit="${WAIT_TIMEOUT:-180}"
pause="${WAIT_INTERVAL:-5}"

# The first <script type="module" ... src="..."> of an index.html on stdin.
entry() { grep -m1 -oE '<script[^>]*type="module"[^>]*' | grep -oE 'src="[^"]+"' | head -1 | cut -d'"' -f2; }

if [ ! -f "$index" ]; then
  echo "::error::$index not found: run npm run build first"
  exit 1
fi
want=$(entry < "$index")
if [ -z "$want" ]; then
  echo "::error::No module script in $index"
  exit 1
fi

html=""
while true; do
  # The query string and no-cache header keep a CDN or browser cache from serving the old page.
  html=$(curl -s -m 5 -H 'Cache-Control: no-cache' "$site/?cb=$RANDOM$SECONDS" || true)
  if printf '%s' "$html" | grep -qF "$want"; then
    echo "Live site serves $want after ${SECONDS}s"
    exit 0
  fi
  [ "$SECONDS" -ge "$limit" ] && break
  sleep "$pause"
done

served=$(printf '%s' "$html" | entry)
echo "::error::New build $want never appeared on $site within ${limit}s; the site serves ${served:-no entry script (no answer?)}"
exit 1
