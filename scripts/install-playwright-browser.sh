#!/usr/bin/env bash
# Installs the Playwright Chromium shell, retrying a slow or failed apt mirror (#123, #127).
# Worst case: 2 attempts x (90 s limit + 5 s kill grace) + clear_apt (15 s wait + 3 s after KILL
# + ~10 s dpkg repair) + 5 s pause = 190 + 28 + 5 = 223 s, inside the 4-min (240 s) step timeout.
# A slow-but-working install of up to ~85 s still passes on the first attempt.
# timeout kills only npx; the root apt-get it started lives on and holds the dpkg/apt lock (#159),
# so clear_apt stops it before the retry (and gives up, rather than retry into the lock, if it stays).
# PW_INSTALL_CMD, PW_ATTEMPT_TIMEOUT, PW_RETRY_SLEEP, PW_LOCK_WAIT and PW_LOCK_PATTERN exist for tests.
set -u

cmd="${PW_INSTALL_CMD:-npx playwright install --with-deps --only-shell chromium}"
limit="${PW_ATTEMPT_TIMEOUT:-90}"
pause="${PW_RETRY_SLEEP:-5}"
lock_wait="${PW_LOCK_WAIT:-15}"
pattern="${PW_LOCK_PATTERN:-apt-get|apt|dpkg}"
attempts=2

# Stop apt/dpkg processes left over from a timed-out attempt so the retry can take the lock.
clear_apt() {
  as_root=""
  if command -v sudo >/dev/null; then as_root="sudo -n"; fi
  pgrep -x "$pattern" >/dev/null 2>&1 || return 0
  $as_root pkill -TERM -x "$pattern" || true
  for _ in $(seq 1 "$lock_wait"); do
    pgrep -x "$pattern" >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -x "$pattern" >/dev/null 2>&1; then
    $as_root pkill -KILL -x "$pattern" || true
    for _ in 1 2 3; do
      pgrep -x "$pattern" >/dev/null 2>&1 || break
      sleep 1
    done
  fi
  if pgrep -x "$pattern" >/dev/null 2>&1; then
    echo "::error::apt/dpkg is still running (lock not released); not retrying"
    exit 1
  fi
  $as_root dpkg --configure -a || true
}

for i in $(seq 1 "$attempts"); do
  # $cmd is deliberately unquoted: it is a command line split into words.
  # shellcheck disable=SC2086
  if timeout -k 5 "$limit" $cmd; then
    exit 0
  fi
  echo "::warning::Playwright browser install attempt $i of $attempts failed"
  if [ "$i" -lt "$attempts" ]; then
    clear_apt
    sleep "$pause"
  fi
done

echo "::error::Playwright browser install failed after $attempts attempts"
exit 1
