import { ESLint } from 'eslint';

describe('installed runtime artifact protection', () => {
  it('excludes signed add-on packages from lint and format while checking application sources', async () => {
    const linter = new ESLint();

    expect(await linter.isPathIgnored('dumps/.installed-addons/synthetic/artifact/server/runtime.cjs')).toBe(true);
    expect(await linter.isPathIgnored('private-backups/.installed-addons/synthetic/artifact/admin/runtime.js'))
      .toBe(true);
    expect(await linter.isPathIgnored('admin/src/app/AdminWorkspace.svelte')).toBe(false);
  });
});
