import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const script = path.resolve('scripts/release-artifact.mjs');

describe('verifiable CMS source artifacts', () => {
  let root: string;
  let output: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-release-'));
    output = await mkdtemp(path.join(os.tmpdir(), 'zarya-package-'));
    await writeFile(path.join(root, 'package.json'), '{"name":"cms-zarya","version":"0.9.2"}\n');
    await writeFile(path.join(root, 'payload.txt'), 'synthetic CMS payload\n');
    await mkdir(path.join(root, '.serena'));
    await writeFile(path.join(root, '.serena', 'private.md'), 'synthetic private development metadata');
    await run('git', ['init', '--quiet'], { cwd: root });
    await writeFile(path.join(root, 'tool.sh'), '#!/bin/sh\nexit 0\n');
    await chmod(path.join(root, 'tool.sh'), 0o755);
    await run('git', ['add', '.'], { cwd: root });
    await run('git', ['update-index', '--chmod=+x', 'tool.sh'], { cwd: root });
    await run('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.test',
      'commit', '--quiet', '-m', 'Synthetic release'], { cwd: root });
  });

  afterEach(async () => {
    for (const directory of [root, output]) {
      if (directory && path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('zarya-')) {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  it('verifies a Git-free package, records provenance and detects changed files', async () => {
    const { stdout } = await run(process.execPath, [script, 'pack', '--root', root, '--output', output]);
    const result: { archive: string; checksum: string } = JSON.parse(stdout);

    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    const listing = await run('tar', ['-tvzf', result.archive]);

    expect(listing.stdout).toMatch(/^-rwxr[wx-]{2}r-x.*tool\.sh$/m);
    await run('tar', ['-xzf', result.archive, '-C', output]);
    const manifest: { version: string; commit: string; checksum: string } = JSON.parse(
      await readFile(path.join(output, 'cms-release.json'), 'utf8'));

    await expect(readFile(path.join(output, '.serena', 'private.md'))).rejects.toThrow();
    expect(manifest.version).toBe('0.9.2');
    expect(manifest.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(manifest.checksum).toMatch(/^[a-f0-9]{64}$/);
    await run(process.execPath, [script, 'verify', '--root', output]);
    await writeFile(path.join(output, 'payload.txt'), 'changed');
    await expect(run(process.execPath, [script, 'verify', '--root', output])).rejects.toThrow();
  });

  it('rejects an uncommitted source tree instead of claiming its HEAD is the packaged source', async () => {
    await writeFile(path.join(root, 'payload.txt'), 'uncommitted');
    await expect(run(process.execPath, [script, 'pack', '--root', root, '--output', output])).rejects.toThrow();
  });
});
