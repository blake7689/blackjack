// Tests the retry loop of scripts/install-playwright-browser.sh (#131) through its PW_* env hooks.
// Node-side test of a shell script, so it lives next to it, not in src/ (outside coverage).
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const bashWithTimeout = spawnSync('bash', ['-c', 'command -v timeout']).status === 0;

// Forward slashes so the unquoted, word-split command also works for Git Bash on Windows.
const posix = (p) => p.replaceAll('\\', '/');

describe.skipIf(!bashWithTimeout)('install-playwright-browser.sh', () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pwinstall-'));
    // Fails on the first call, succeeds after: the counter file lives in the temp dir.
    writeFileSync(
      join(dir, 'flaky.sh'),
      `n=$(cat "${posix(dir)}/count" 2>/dev/null || echo 0)\necho $((n + 1)) > "${posix(dir)}/count"\n[ "$n" -ge 1 ]\n`,
    );
    // A stub sudo first on PATH: the script's `sudo dpkg --configure -a` repair must never prompt or touch the machine.
    writeFileSync(join(dir, 'sudo'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'sudo'), 0o755);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (cmd, limit = '5') => {
    const started = Date.now();
    const r = spawnSync('bash', ['scripts/install-playwright-browser.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${posix(dir)}:${process.env.PATH}`,
        PW_INSTALL_CMD: cmd,
        PW_ATTEMPT_TIMEOUT: limit,
        PW_RETRY_SLEEP: '0',
      },
    });
    return { ...r, elapsed: Date.now() - started };
  };
  const warnings = (stdout) => stdout.split('\n').filter((l) => l.startsWith('::warning::'));

  it('retries once after a failed first attempt and then succeeds', () => {
    const r = run(`bash ${posix(dir)}/flaky.sh`);
    expect(r.status).toBe(0);
    expect(warnings(r.stdout)).toHaveLength(1);
    expect(r.stdout).not.toContain('::error::');
  });

  it('gives up with an error after two failed attempts', () => {
    const r = run('false');
    expect(r.status).toBe(1);
    expect(warnings(r.stdout)).toHaveLength(2);
    expect(r.stdout).toContain('::error::Playwright browser install failed after 2 attempts');
  });

  it('kills an attempt that hangs past the limit', () => {
    const r = run('sleep 30', '1');
    expect(r.status).toBe(1);
    expect(r.elapsed).toBeLessThan(15000);
    expect(warnings(r.stdout)).toHaveLength(2);
  }, 30000);
});
