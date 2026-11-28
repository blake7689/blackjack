// @vitest-environment node
// Guards the CI hardening (#198), which a later edit could undo without any run failing. Plain text checks, no YAML parser.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const files = readdirSync(join(root, '.github', 'workflows')).filter((name) => /\.ya?ml$/.test(name));
const workflow = (name) => read('.github', 'workflows', name);
const swa = workflow(files.find((name) => name.startsWith('azure-static-web-apps-')));
// A job's text: from its key (2 spaces in) to the next job's key or the end of the file.
const job = (text, id) => text.split(`\n  ${id}:\n`)[1]?.split(/\n {2}[\w-]+:\n/)[0] ?? '';

describe('the workflows', () => {
  it.each(files)('%s pins every non-local action to a commit SHA, with the version in a comment', (name) => {
    const uses = workflow(name).split('\n').filter((line) => /^\s*(-\s+)?uses:/.test(line));
    const unpinned = uses.filter((line) => !/uses:\s+\.\//.test(line) && !/uses:\s+[^@\s]+@[0-9a-f]{40}\s+#\s*v\d+(\.\d+)*\s*$/.test(line));
    expect(unpinned).toEqual([]);
  });
});

describe('the Static Web Apps workflow', () => {
  it('gets the OIDC token from github-script\'s own core, with no npm install of @actions packages', () => {
    expect(swa).not.toMatch(/npm\s+(install|i|add)\b.*@actions\//);
    for (const id of ['build_and_deploy_job', 'close_pull_request_job']) expect(job(swa, id), id).toContain('await core.getIDToken()');
  });

  it('queues runs per PR or ref at workflow level, and cancels a running one only for pull requests', () => {
    expect(swa).toMatch(
      /^concurrency:\n {2}group: swa-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/m,
    );
  });

  it.each(['build_and_deploy_job', 'close_pull_request_job'])('%s skips Dependabot pull requests', (id) => {
    // Joined with && at the top level, so it cannot be one branch of an ||.
    const condition = job(swa, id).match(/^ {4}if: (.*)$/m)?.[1] ?? '';
    expect(condition).toMatch(/(^|&& )github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'( &&|$)/);
  });

  it('calls ci.yml, which must not join the caller\'s concurrency group (the called job would deadlock)', () => {
    expect(swa).toContain('uses: ./.github/workflows/ci.yml');
    expect(workflow('ci.yml')).not.toMatch(/group:\s*['"]?swa-/);
  });
});

describe('dependabot.yml', () => {
  it.each(['npm', 'github-actions'])('updates %s from the repo root', (ecosystem) => {
    const entry = read('.github', 'dependabot.yml').split('- package-ecosystem: ').find((part) => part.startsWith(`${ecosystem}\n`));
    expect(entry).toMatch(/\n {4}directory: \/\n/);
    expect(entry).toMatch(/\n {4}schedule:\n {6}interval: \w+\n/);
  });
  // Majors are taken by hand (#223); minor and patch updates arrive as one grouped PR.
  it.each(['npm', 'github-actions'])('%s ignores every semver-major update and groups minor with patch', (ecosystem) => {
    const entry = read('.github', 'dependabot.yml').split('- package-ecosystem: ').find((part) => part.startsWith(`${ecosystem}\n`));
    expect(entry).toMatch(/\n {4}ignore:\n {6}- dependency-name: "\*"\n {8}update-types: \["version-update:semver-major"\]\n/);
    expect(entry).toMatch(/\n {4}groups:\n {6}[\w-]+:\n {8}update-types: \[minor, patch\]/);
  });
});
