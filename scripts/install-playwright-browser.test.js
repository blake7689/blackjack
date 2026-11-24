// @vitest-environment node
// Tests the retry loop of scripts/install-playwright-browser.sh (#131, #159) through its PW_* env hooks.
// Node-side test of a shell script, so it lives next to it, not in src/ (outside coverage).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Forward slashes so the unquoted, word-split command also works for Git Bash on Windows.
const posix = (p) => p.replaceAll('\\', '/');
const repoRoot = join(import.meta.dirname, '..');

// Needs bash with `timeout` that resolves our temp paths (WSL bash cannot see C:/ paths: skip).
const bashWithTimeout =
  spawnSync('bash', ['-c', 'command -v timeout && test -d "$1"', '_', posix(tmpdir())]).status === 0;

// The lock tests (#159) also need pgrep and pkill (Git Bash on Windows has no pgrep; Linux CI has both).
const hasPgrep = spawnSync('bash', ['-c', 'command -v pgrep && command -v pkill']).status === 0;

describe.skipIf(!bashWithTimeout)('install-playwright-browser.sh', () => {
  let dir;
  const file = (name) => join(dir, name);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pwinstall-'));
    // Fails on the first call, succeeds after: the counter file lives in the temp dir.
    writeFileSync(
      file('flaky.sh'),
      `n=$(cat "${posix(dir)}/count" 2>/dev/null || echo 0)\necho $((n + 1)) > "${posix(dir)}/count"\n[ "$n" -ge 1 ]\n`,
    );
    // Stubs first on PATH, so the script never prompts or touches the machine: sudo just runs its command
    // (minus `-n`), dpkg only records its call.
    const stub = (path, body) => {
      writeFileSync(path, `#!/bin/sh\n${body}\n`);
      chmodSync(path, 0o755);
    };
    stub(file('sudo'), '[ "$1" = "-n" ] && shift\nexec "$@"');
    stub(file('dpkg'), `echo "$@" >> "${posix(dir)}/dpkg.log"`);
    // A pkill that does nothing, in a dir of its own that only the lock-never-clears test puts on PATH.
    mkdirSync(file('nokill'));
    stub(join(file('nokill'), 'pkill'), 'exit 0');
    // A leftover "apt": a copy of bash (not sleep: coreutils may be one multi-call binary that fails under another
    // name) whose process name is fakeapt, which PW_LOCK_PATTERN points at. It runs `sleep` as a child.
    if (hasPgrep) spawnSync('bash', ['-c', 'cp "$(command -v bash)" "$1/fakeapt"', '_', posix(dir)]);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (cmd, limit = '5', env = {}, pathDirs = []) => {
    const started = Date.now();
    const r = spawnSync('bash', ['scripts/install-playwright-browser.sh'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${[...pathDirs, dir].map(posix).join(':')}:${process.env.PATH}`,
        PW_INSTALL_CMD: cmd,
        PW_ATTEMPT_TIMEOUT: limit,
        PW_RETRY_SLEEP: '0',
        ...env,
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

  // #159: timeout kills only npx; the apt-get it started lives on and holds the dpkg lock until clear_apt stops it.
  describe.skipIf(!hasPgrep)('apt lock left behind by a timed-out attempt', () => {
    const dpkgCalls = () =>
      existsSync(file('dpkg.log')) ? readFileSync(file('dpkg.log'), 'utf8').trim().split('\n') : [];
    const installs = () => Number(readFileSync(file('lock-count'), 'utf8'));

    // Attempt 1 starts `leftover` in the background, waits until pgrep sees it, and fails.
    // Attempt 2 succeeds only if no leftover is running any more.
    const lockScript = (leftover) =>
      writeFileSync(
        file('lock.sh'),
        `n=$(cat "${posix(dir)}/lock-count" 2>/dev/null || echo 0)
echo $((n + 1)) > "${posix(dir)}/lock-count"
if [ "$n" -eq 0 ]; then
  ${leftover} >/dev/null 2>&1 </dev/null &
  until pgrep -x fakeapt >/dev/null; do sleep 0.05; done
  exit 1
fi
! pgrep -x fakeapt >/dev/null
`,
      );
    const runLock = (env = {}, pathDirs = []) =>
      run(`bash ${posix(dir)}/lock.sh`, '5', { PW_LOCK_PATTERN: 'fakeapt', ...env }, pathDirs);

    beforeEach(() => {
      for (const name of ['count', 'lock-count', 'dpkg.log']) rmSync(file(name), { force: true });
    });
    // Nothing may be left running, even when a test fails half way.
    afterEach(() => spawnSync('bash', ['-c', 'pkill -x fakeapt']));

    it('stops the leftover, repairs dpkg once, and retries into a free lock', () => {
      // The trailing `; :` stops bash exec-ing sleep directly, which would rename the process to sleep.
      lockScript(`${posix(dir)}/fakeapt -c 'sleep 30; :'`);
      const r = runLock();
      expect(r.status).toBe(0);
      expect(installs()).toBe(2);
      expect(dpkgCalls()).toEqual(['--configure -a']);
      expect(r.stdout).not.toContain('::error::');
    }, 30000);

    it('waits for a leftover that ignores TERM to exit by itself, then retries', () => {
      // `trap ''` is inherited by the sleep child, so the whole leftover ignores TERM and exits after 2 s.
      lockScript(`${posix(dir)}/fakeapt -c "trap '' TERM; sleep 2; :"`);
      const r = runLock();
      expect(r.status).toBe(0);
      expect(r.elapsed).toBeGreaterThanOrEqual(1500);
      expect(installs()).toBe(2);
      expect(dpkgCalls()).toEqual(['--configure -a']);
    }, 30000);

    it('gives up without a second attempt when the lock never clears', () => {
      lockScript(`${posix(dir)}/fakeapt -c 'sleep 20; :'`);
      const r = runLock({ PW_LOCK_WAIT: '2' }, [file('nokill')]);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('::error::apt/dpkg is still running');
      expect(installs()).toBe(1);
      expect(dpkgCalls()).toEqual([]);
      expect(r.elapsed).toBeLessThan(15000);
    }, 30000);

    it('does not run the dpkg repair when nothing was left running', () => {
      const r = runLock({ PW_INSTALL_CMD: `bash ${posix(dir)}/flaky.sh` });
      expect(r.status).toBe(0);
      expect(warnings(r.stdout)).toHaveLength(1);
      expect(dpkgCalls()).toEqual([]);
    });
  });
});
