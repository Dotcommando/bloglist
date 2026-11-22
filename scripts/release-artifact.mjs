import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs, promisify } from 'node:util';
import { createGzip } from 'node:zlib';

const run = promisify(execFile);

const manifestName = 'cms-release.json';

async function jsonFile(filename) {
  if ((await lstat(filename)).size > 8 * 1024 * 1024) {
    throw new Error('Release metadata exceeds its limit');
  }

  return JSON.parse(await readFile(filename, 'utf8'));
}

async function digest(filename) {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(filename, { highWaterMark: 65536 })) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

function inventoryChecksum(files) {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

async function inventory(root, ignored = new Set()) {
  const files = [];

  async function visit(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const relative = prefix + name;

      if (ignored.has(relative)) {
        continue;
      }

      const filename = path.join(directory, name);
      const info = await lstat(filename);

      if (info.isSymbolicLink()) {
        throw new Error('Release payload must not contain symbolic links');
      }
      if (info.isDirectory()) {
        await visit(filename, relative + '/');
      } else if (info.isFile()) {
        files.push({ path: relative, bytes: info.size, sha256: await digest(filename) });
      } else {
        throw new Error('Unsupported release payload entry');
      }
    }
  }

  await visit(root);

  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function verify(root) {
  const manifest = await jsonFile(path.join(root, manifestName));

  if (
    manifest.format !== 1
    || !/^\d+\.\d+\.\d+$/.test(manifest.version)
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(manifest.commit)
    || !Array.isArray(manifest.files)
    || manifest.checksum !== inventoryChecksum(manifest.files)
  ) {
    throw new Error('Invalid CMS release manifest');
  }

  const archive = 'cms-zarya-' + manifest.version + '-' + manifest.commit.slice(0, 12) + '.tar.gz';
  const files = await inventory(root, new Set([manifestName, archive, archive + '.sha256']));

  if (
    JSON.stringify(files) !== JSON.stringify(manifest.files)
    || (await jsonFile(path.join(root, 'package.json'))).version !== manifest.version
  ) {
    throw new Error('CMS release payload verification failed');
  }

  return { version: manifest.version, commit: manifest.commit, checksum: manifest.checksum };
}

async function pack(root, output) {
  const { stdout: status } = await run('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root });

  if (status.trim()) {
    throw new Error('Commit all CMS source changes before packaging a release');
  }

  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root });
  const commit = stdout.trim();
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'zarya-release-stage-'));

  if (path.dirname(temporary) !== os.tmpdir() || !path.basename(temporary).startsWith('zarya-release-stage-')) {
    throw new Error('Unsafe release staging directory');
  }

  try {
    const payload = path.join(temporary, 'payload');

    await mkdir(payload);
    const sourceArchive = path.join(temporary, 'source.tar');

    await run('git', ['archive', '--format=tar', '--output=' + sourceArchive, commit, '--', '.',
      ':(exclude).serena', ':(exclude).codex', ':(exclude).agents', ':(exclude).idea',
      ':(exclude)' + manifestName], { cwd: root });
    await run('tar', ['-xf', path.join(temporary, 'source.tar'), '-C', payload]);

    for (const name of ['.serena', '.codex', '.agents', '.idea']) {
      const directory = path.resolve(payload, name);

      if (path.dirname(directory) !== payload) {
        throw new Error('Unsafe development metadata directory');
      }
      await rm(directory, { recursive: true, force: true });
    }
    const { version } = await jsonFile(path.join(payload, 'package.json'));

    if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit)) {
      throw new Error('Invalid CMS release identity');
    }

    const files = await inventory(payload, new Set([manifestName]));

    if (
      files.some((file) => /(^|\/)(\.env(?!\.example$)(\..*)?|cloudflare\.json|\.secrets|\.cloudflare)(\/|$)/
        .test(file.path))
    ) {
      throw new Error('Private installation settings cannot be packaged');
    }
    await writeFile(path.join(payload, manifestName), JSON.stringify({
      format: 1,
      version,
      commit,
      checksum: inventoryChecksum(files),
      files,
    }, null, 2) + '\n');
    await verify(payload);
    await mkdir(output, { recursive: true });
    const name = 'cms-zarya-' + version + '-' + commit.slice(0, 12) + '.tar.gz';
    const archive = path.join(output, name);

    // Append only metadata to Git's tar so source executable bits survive Windows packaging.
    await run('tar', ['-rf', sourceArchive, '-C', payload, manifestName]);
    await pipeline(createReadStream(sourceArchive), createGzip({ level: 9 }), createWriteStream(archive));
    const checksum = await digest(archive);

    await writeFile(archive + '.sha256', checksum + '  ' + name + '\n');

    return { archive, checksum };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { root: { type: 'string' }, output: { type: 'string' } },
});

const root = path.resolve(values.root ?? '.');

if (positionals.length !== 1 || !['pack', 'verify'].includes(positionals[0])) {
  throw new Error('Usage: release-artifact.mjs pack|verify [--root directory] [--output directory]');
}

console.log(JSON.stringify(positionals[0] === 'pack'
  ? await pack(root, path.resolve(values.output ?? '.tmp/releases')) : await verify(root)));
