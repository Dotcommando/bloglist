import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

describe('type checking a clean workspace', () => {
  it('builds the real SDK before checking consumers and still rejects type errors', async () => {
    const npm = process.env.npm_execpath;

    if (!npm) {
      throw new Error('Run this regression through npm test');
    }

    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-typecheck-'));

    try {
      const pkg: { scripts: Record<string, string> } = JSON.parse(await readFile('package.json', 'utf8'));
      const contracts = path.join(root, 'packages/addon-contracts');
      const modules = path.join(root, 'node_modules');

      await mkdir(contracts, { recursive: true });
      await mkdir(path.join(modules, '@zarya'), { recursive: true });
      await mkdir(path.join(modules, '.bin'));
      await symlink(path.resolve('node_modules/typescript'), path.join(modules, 'typescript'), 'junction');
      await symlink(contracts, path.join(modules, '@zarya/addon-contracts'), 'junction');

      for (const name of process.platform === 'win32' ? ['tsc', 'tsc.cmd'] : ['tsc']) {
        await cp(path.join('node_modules/.bin', name), path.join(modules, '.bin', name));
      }

      for (const name of ['package.json', 'tsconfig.json', 'src']) {
        await cp(path.join('packages/addon-contracts', name), path.join(contracts, name), { recursive: true });
      }
      await writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'synthetic-sdk-consumer',
        private: true,
        type: 'module',
        workspaces: ['packages/addon-contracts'],
        scripts: {
          'build:contracts': pkg.scripts['build:contracts'],
          'typecheck:server': pkg.scripts['typecheck:server'],
        },
      }));

      for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
        const config: { compilerOptions: Record<string, unknown> } = JSON.parse(await readFile(name, 'utf8'));

        config.compilerOptions.types = [];
        await writeFile(path.join(root, name), JSON.stringify(config));
      }
      await mkdir(path.join(root, 'src'));
      const consumer = path.join(root, 'src/consumer.ts');

      await writeFile(consumer, "export * from '@zarya/addon-contracts/cms';\n");
      await expect(readFile(path.join(contracts, 'dist/cms.d.ts'))).rejects.toThrow();
      await run(process.execPath, [npm, 'run', 'typecheck:server'], { cwd: root })
        .catch((error: { stdout: string; stderr: string }) => {
          throw new Error(error.stdout + error.stderr);
        });
      expect(await readFile(path.join(contracts, 'dist/cms.d.ts'), 'utf8')).toContain('export');

      await writeFile(consumer, 'export const invalid: string = 42;\n');
      await expect(run(process.execPath, [npm, 'run', 'typecheck:server'], { cwd: root }))
        .rejects.toMatchObject({ stdout: expect.stringContaining('TS2322') });
    } finally {
      if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('zarya-typecheck-')) {
        await rm(root, { recursive: true, force: true });
      }
    }
  }, 30_000);
});
