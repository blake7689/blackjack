// @vitest-environment node
// Tests scripts/wait-for-build.sh (#190) against a local http server through its env hooks.
// Node-side test of a shell script, so it lives next to it, not in src/ (outside coverage).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const posix = (p) => p.replaceAll('\\', '/');
const repoRoot = join(import.meta.dirname, '..');
const page = (src) => `<!doctype html><html><head><script type="module" crossorigin src="${src}"></script></head></html>`;

// Needs bash and curl, and bash must resolve our temp paths (WSL bash cannot see C:/ paths: skip).
const hasTools =
  spawnSync('bash', ['-c', 'command -v curl && test -d "$1"', '_', posix(tmpdir())]).status === 0;

describe.skipIf(!hasTools)('wait-for-build.sh', () => {
  let dir;
  let server;
  let url;
  let served = ''; // the index.html the server answers with; '' means 404
  const NEW = '/assets/index-NEW.js';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'waitbuild-'));
    writeFileSync(join(dir, 'index.html'), page(NEW));
    writeFileSync(join(dir, 'empty.html'), '<html></html>');
    server = createServer((req, res) => {
      res.statusCode = served ? 200 : 404;
      res.end(served);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    served = '';
  });

  // Async spawn: the test's own server must keep answering while the script runs.
  const run = (env = {}) =>
    new Promise((resolve) => {
      let stdout = '';
      const p = spawn('bash', ['scripts/wait-for-build.sh'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          SITE_URL: url,
          DIST_INDEX: posix(join(dir, 'index.html')),
          WAIT_TIMEOUT: '3',
          WAIT_INTERVAL: '1',
          ...env,
        },
      });
      p.stdout.on('data', (d) => (stdout += d));
      p.on('close', (status) => resolve({ status, stdout }));
    });

  it('succeeds at once when the new build is already served', async () => {
    served = page(NEW);
    const r = await run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(NEW);
  });

  it('waits until the new build appears', async () => {
    served = page('/assets/index-OLD.js');
    setTimeout(() => (served = page(NEW)), 1500);
    const r = await run({ WAIT_TIMEOUT: '10' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(NEW);
  }, 20000);

  it('fails with an error naming the asset and what the site serves when it never appears', async () => {
    served = page('/assets/index-OLD.js');
    const r = await run({ WAIT_TIMEOUT: '2' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`::error::New build ${NEW} never appeared`);
    expect(r.stdout).toContain('within 2s');
    expect(r.stdout).toContain('/assets/index-OLD.js');
  }, 20000);

  it('fails when the site gives no page at all', async () => {
    const r = await run({ WAIT_TIMEOUT: '1' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('no entry script');
  }, 20000);

  it('fails when the dist index is missing', async () => {
    const r = await run({ DIST_INDEX: posix(join(dir, 'nope.html')) });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('::error::');
    expect(r.stdout).toContain('not found');
  });

  it('fails when the dist index has no module script', async () => {
    const r = await run({ DIST_INDEX: posix(join(dir, 'empty.html')) });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('No module script');
  });
});
