import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

enum ImageRole {
  Runtime = 'runtime',
  Cloudflare = 'cloudflare',
}

enum ImageFault {
  UnreadableSdk = 'UnreadableSdk',
  MissingComposition = 'MissingComposition',
  RootUser = 'RootUser',
}

interface IBuildResult {
  readonly exitCode: number;
  readonly output: string;
}

function withFault(source: string, role: ImageRole, fault: ImageFault): string {
  let stage = '';
  let injected = 0;
  const module = role === ImageRole.Runtime ? 'public-http.module.js' : 'deployment/manage-deployment.js';
  const instruction = fault === ImageFault.UnreadableSdk
    ? 'RUN chmod 0700 /app/packages/addon-contracts'
    : 'RUN rm /app/dist/infra/' + module;
  const result = source.split(/\r?\n/).map((line) => {
    const from = /^FROM \S+ AS (\S+)$/i.exec(line);

    if (from) {
      stage = from[1]!;
    }
    if (stage !== role || line !== 'USER node') {
      return line;
    }
    injected++;

    return fault === ImageFault.RootUser ? 'USER root' : instruction + '\n' + line;
  }).join('\n');

  assert.equal(injected, 1, 'Expected one service-user boundary in the selected Docker target');

  return result;
}

async function removeBuiltImage(imageFile: string): Promise<void> {
  let image: string | null = null;

  try {
    image = (await readFile(imageFile, 'utf8')).trim();
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (image) {
    assert.match(image, /^sha256:[a-f0-9]{64}$/);
    await run('docker', ['image', 'rm', image], { timeout: 30000, windowsHide: true });
  }
}

async function build(role: ImageRole, fault?: ImageFault): Promise<IBuildResult> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zarya-image-imports-'));
  const imageFile = path.join(directory, 'image.id');

  try {
    const source = await readFile('Dockerfile', 'utf8');
    const input = fault ? withFault(source, role, fault) : source;
    const dockerfile = path.join(directory, 'Dockerfile');

    await writeFile(dockerfile, input);

    try {
      const result = await run('docker', [
        'build', '--force-rm', '--target', role, '--iidfile', imageFile, '--file', dockerfile, '.',
      ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 270000, windowsHide: true });

      return { exitCode: 0, output: result.stdout + result.stderr };
    } catch (error) {
      if (
        !(error instanceof Error)
        || !('code' in error)
        || typeof error.code !== 'number'
        || !('stdout' in error)
        || typeof error.stdout !== 'string'
        || !('stderr' in error)
        || typeof error.stderr !== 'string'
      ) {
        throw error;
      }

      return { exitCode: error.code, output: error.stdout + error.stderr };
    }
  } finally {
    try {
      await removeBuiltImage(imageFile);
    } finally {
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
      assert(path.basename(directory).startsWith('zarya-image-imports-'));
      await rm(directory, { recursive: true, force: true });
    }
  }
}

describe.each([ImageRole.Runtime, ImageRole.Cloudflare])('%s image module verification', (role) => {
  it('imports its composition as UID 1000 during the real Docker build', async () => {
    const result = await build(role);

    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain('Zarya ' + role + ' image imports verified as UID 1000');
  }, 300000);

  it('rejects an unreadable workspace SDK during the real Docker build', async () => {
    const result = await build(role, ImageFault.UnreadableSdk);

    expect(result.exitCode, result.output).not.toBe(0);
    expect(result.output).toMatch(/ERR_MODULE_NOT_FOUND|EACCES/);
    expect(result.output).toContain('@zarya/addon-contracts');
  }, 300000);

  it('rejects a missing role composition during the real Docker build', async () => {
    const result = await build(role, ImageFault.MissingComposition);

    expect(result.exitCode, result.output).not.toBe(0);
    expect(result.output).toContain('ERR_MODULE_NOT_FOUND');
    expect(result.output).toContain(role === ImageRole.Runtime ? 'public-http.module.js' : 'manage-deployment.js');
  }, 300000);
});

it('rejects running image verification as root', async () => {
  const result = await build(ImageRole.Runtime, ImageFault.RootUser);

  expect(result.exitCode, result.output).not.toBe(0);
  expect(result.output).toContain('Image verification requires UID 1000');
}, 300000);
