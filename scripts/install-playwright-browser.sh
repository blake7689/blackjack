#!/usr/bin/env bash
# Installs the Playwright Chromium shell, retrying a slow or failed apt mirror (#123, #127).
# Worst case: 2 attempts x (105 s limit + 5 s kill grace) + 5 s pause + ~10 s dpkg repair
# = 220 + 5 + 10 = 235 s, inside the 4-min (240 s) step timeout in the workflows.
# A slow-but-working install of up to ~100 s still passes on the first attempt.
# PW_INSTALL_CMD, PW_ATTEMPT_TIMEOUT and PW_RETRY_SLEEP exist so the retry loop can be tested.
set -u

cmd="${PW_INSTALL_CMD:-npx playwright install --with-deps --only-shell chromium}"
limit="${PW_ATTEMPT_TIMEOUT:-105}"
pause="${PW_RETRY_SLEEP:-5}"
attempts=2

for i in $(seq 1 "$attempts"); do
  # $cmd is deliberately unquoted: it is a command line split into words.
  # shellcheck disable=SC2086
  if timeout -k 5 "$limit" $cmd; then
    exit 0
  fi
  echo "::warning::Playwright browser install attempt $i of $attempts failed"
  if [ "$i" -lt "$attempts" ]; then
    # A kill mid-apt can leave dpkg interrupted; repair it before retrying (no-op without sudo).
    command -v sudo >/dev/null && sudo dpkg --configure -a || true
    sleep "$pause"
  fi
done

echo "::error::Playwright browser install failed after $attempts attempts"
exit 1
