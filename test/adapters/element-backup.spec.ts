import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BasicRenderingSourceAdapter,
} from '../../src/adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import { FileElementBackupAdapter } from '../../src/adapters/outbound/rendering/files/element-backup.adapter.js';
import { FileElementFallbackAdapter } from '../../src/adapters/outbound/rendering/files/element-fallback.adapter.js';
import { FileRenderingSourceAdapter } from '../../src/adapters/outbound/rendering/files/rendering-source.adapter.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { paginationParameters, paginationSnippetSource } from '../../src/domain/rendering/pagination-snippet.js';
import { elementFixture } from '../support/rendering.js';

describe('atomic source backups and file fallback', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.resolve('.tmp/element-backup-'));
  });
  afterEach(async () => {
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each([TemplateSourceKind.Chunk, TemplateSourceKind.Snippet])(
    'names %s backups by display name and reads their identity from JSON', async (kind) => {
      const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
      const backup = new FileElementBackupAdapter(root, files);
      const entity = elementFixture({
        kind,
        key: '17',
        name: 'Название элемента',
        html: '',
        ...(kind === TemplateSourceKind.Snippet ? { snippet: paginationSnippetSource } : {}),
      });

      await backup.write(entity);
      const site = await files.locate(entity.siteId);
      const group = kind === TemplateSourceKind.Chunk ? 'chunks' : 'snippets';
      const directory = path.join(root, site!.key, 'elements', group);

      expect(await readdir(directory)).toEqual(['Название элемента.json']);
      expect(JSON.parse(await readFile(path.join(directory, 'Название элемента.json'), 'utf8'))).toMatchObject({
        key: '17', name: entity.name,
      });
      expect((await new FileElementFallbackAdapter(files).list(entity.siteId, []))
        .find((element) => element.kind === kind && element.key === '17')).toEqual(entity);
      const sources = await files.read(entity.siteId);

      expect(sources.templates.find((element) => element.kind === kind && element.id === '17'))
        .toMatchObject({ name: entity.name });
    });
  it('removes the former name and legacy numeric file after a complete save', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);
    const entity = elementFixture({ kind: TemplateSourceKind.Chunk, key: '7', name: 'Old name' });

    await backup.write(entity);
    const site = await files.locate(entity.siteId);
    const directory = path.join(root, site!.key, 'elements/chunks');

    await writeFile(path.join(directory, '7.json'), JSON.stringify(entity));
    await backup.write({ ...entity, name: 'New name', version: 'v2' });
    expect(await readdir(directory)).toEqual(['New name.json']);
    const recovered = await new FileElementFallbackAdapter(files).list(entity.siteId, []);

    expect(recovered.filter((element) => element.kind === entity.kind && element.key === entity.key)).toMatchObject([{
      key: '7', name: 'New name', version: 'v2',
    }]);
  });
  it('ignores a malformed named copy when the authoritative database entity is available', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const entity = elementFixture({ kind: TemplateSourceKind.Chunk, key: '71', name: 'Current chunk' });

    await new FileElementBackupAdapter(root, files).write(entity);
    const site = await files.locate(entity.siteId);

    await writeFile(path.join(root, site!.key, 'elements/chunks/Current chunk.json'), 'invalid JSON');
    expect((await files.readExcluding(entity.siteId, [entity])).templates
      .some((element) => element.id === entity.key && element.kind === entity.kind)).toBe(false);
    await expect(files.read(entity.siteId)).rejects.toThrow();
  });
  it('keeps concurrent duplicate names in separate readable files without using entity keys', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);

    await Promise.all(['71', '93'].map((key) => backup.write(elementFixture({
      kind: TemplateSourceKind.Chunk, key, elementId: 'element-' + key, name: 'Shared name', html: key,
    }))));
    const site = await files.locate('site-1');
    const directory = path.join(root, site!.key, 'elements/chunks');

    expect((await readdir(directory)).sort()).toEqual(['Shared name (2).json', 'Shared name.json']);
    const recovered = (await new FileElementFallbackAdapter(files).list('site-1', []))
      .filter((element) => element.kind === TemplateSourceKind.Chunk && element.name === 'Shared name');

    expect(recovered.map((element) => element.key).sort()).toEqual(['71', '93']);
    await backup.write({ ...recovered[0]!, version: 'v2' });
    expect((await readdir(directory)).sort()).toEqual(['Shared name (2).json', 'Shared name.json']);
  });
  it('keeps case-only name collisions distinct on every filesystem', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);

    await backup.write(elementFixture({ kind: TemplateSourceKind.Chunk, key: '1', name: 'Readable name' }));
    await backup.write(elementFixture({ kind: TemplateSourceKind.Chunk, key: '2', name: 'readable name' }));
    const site = await files.locate('site-1');

    expect((await readdir(path.join(root, site!.key, 'elements/chunks'))).sort())
      .toEqual(['Readable name.json', 'readable name (2).json']);
  });
  it('updates filename casing when the display name changes only in case', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);
    const entity = elementFixture({ kind: TemplateSourceKind.Chunk, key: '5', name: 'Readable name' });

    await backup.write(entity);
    await backup.write({ ...entity, name: 'readable name', version: 'v2' });
    const site = await files.locate(entity.siteId);

    expect(await readdir(path.join(root, site!.key, 'elements/chunks'))).toEqual(['readable name.json']);
  });
  it('reads and replaces a named copy whose JSON extension has different casing', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);
    const entity = elementFixture({ kind: TemplateSourceKind.Chunk, key: '6', name: 'Readable chunk' });

    await backup.write(entity);
    const site = await files.locate(entity.siteId);
    const directory = path.join(root, site!.key, 'elements/chunks');

    await rename(path.join(directory, 'Readable chunk.json'), path.join(directory, 'Readable chunk.JSON'));
    expect((await files.readBackups(entity.siteId, [])).find((element) => element.key === entity.key)).toEqual(entity);
    await backup.write({ ...entity, version: 'v2' });
    expect(await readdir(directory)).toEqual(['Readable chunk.json']);
  });
  it('does not overwrite a foreign named snapshot or follow a named symlink', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);
    const entity = elementFixture({ kind: TemplateSourceKind.Chunk, key: '5', name: 'Owned chunk' });

    await backup.write(entity);
    const site = await files.locate(entity.siteId);
    const target = path.join(root, site!.key, 'elements/chunks/Owned chunk.json');
    const foreign = JSON.stringify({ ...entity, siteId: 'other-site' });

    await writeFile(target, foreign);
    await expect(backup.write(entity)).rejects.toThrow('Foreign source backup');
    expect(await readFile(target, 'utf8')).toBe(foreign);
    await rm(target);
    const privateFile = path.join(root, 'private', 'private.json');

    await mkdir(path.dirname(privateFile));
    await writeFile(privateFile, foreign);
    await symlink(path.dirname(privateFile), target, 'junction');
    await expect(backup.write(entity)).rejects.toThrow('Source escapes');
    expect(await readFile(privateFile, 'utf8')).toBe(foreign);
  });
  it.each(['../A/B: C?', 'CON', 'NUL.txt', 'Name. ', 'Имя с пробелами', 'x'.repeat(200), 'Я'.repeat(98) + ' .Z'])(
    'keeps the display name %s inside a portable filename', async (name) => {
      const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
      const backup = new FileElementBackupAdapter(root, files);
      const entity = elementFixture({ kind: TemplateSourceKind.Chunk, key: '19', name });

      await backup.write(entity);
      const site = await files.locate(entity.siteId);
      const directory = path.join(root, site!.key, 'elements/chunks');
      const [filename] = await readdir(directory);

      expect(filename).not.toMatch(/[<>:"/\\|?*]/);
      expect(filename).not.toBe('19.json');
      expect((await new FileElementFallbackAdapter(files).list(entity.siteId, []))
        .find((element) => element.kind === entity.kind)).toEqual(entity);
    });
  it('round trips numeric keys and Unicode names while reading old backups without a name', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);
    const entity = elementFixture({ key: '1', name: 'Главный шаблон' });

    await backup.write(entity);
    const fallback = new FileElementFallbackAdapter(files);

    expect((await fallback.list('site-1', [])).find((item) => item.key === '1')).toEqual(entity);
    const legacy = elementFixture();
    const { name, ...old } = legacy;
    const site = await files.locate('site-1');

    expect(name).toBe('Home');
    await writeFile(path.join(root, site!.key, 'elements/templates/Home.json'), JSON.stringify(old));
    expect((await fallback.list('site-1', [])).find((item) => item.key === 'Home')?.name).toBe('Home');
  });
  it('round trips editable Snippet code and contracts without treating it as browser assets', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);
    const entity = elementFixture({
      kind: TemplateSourceKind.Snippet,
      key: 'Pagination',
      name: 'Pagination',
      html: '',
      snippet: paginationSnippetSource,
      parameters: paginationParameters,
    });

    await backup.write(entity);
    const fallback = new FileElementFallbackAdapter(files);

    expect((await fallback.list('site-1', [])).find((item) => item.kind === TemplateSourceKind.Snippet))
      .toEqual(entity);
    expect((await files.read('site-1')).frontendSources.some((item) => item.id.startsWith('snippets/'))).toBe(false);
  });
  it('rejects a legacy source symlink into a different site in the same root', async () => {
    await mkdir(path.join(root, 'demo/templates'), { recursive: true });
    await mkdir(path.join(root, 'other/templates/Home'), { recursive: true });
    await writeFile(path.join(root, 'demo/site.config.json'), JSON.stringify({ siteId: 'site-1' }));
    await writeFile(path.join(root, 'other/site.config.json'), JSON.stringify({ siteId: 'other' }));
    await writeFile(path.join(root, 'other/templates/Home/index.html'), 'Private other site source');
    await symlink(path.join(root, 'other/templates/Home'), path.join(root, 'demo/templates/Home'), 'junction');
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());

    await expect(files.read('site-1')).rejects.toThrow('Source escapes the configured site');
  });
  it('backs up an entire entity, restores it without the database, and preserves trusted legacy config', async () => {
    await mkdir(path.join(root, 'demo/templates/Home'), { recursive: true });
    await writeFile(path.join(root, 'demo/site.config.ts'), "export default {siteId:'site-1'}");
    await writeFile(path.join(root, 'demo/templates/Home/index.html'), 'legacy');
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);

    await backup.write(elementFixture());
    const fallback = new FileElementFallbackAdapter(files);
    const restored = (await fallback.list('site-1', [])).find((item) => item.key === 'Home');

    expect(restored).toMatchObject({ version: 'v1', html: elementFixture().html, backupState: 'Ready' });
    expect(await readFile(path.join(root, 'demo/site.config.ts'), 'utf8')).toContain('export default');
    expect((await fallback.list('site-1', [elementFixture()])).some((item) => item.key === 'Home')).toBe(false);
  });
  it('creates a data-only site mapping for new sites and rejects foreign backup content', async () => {
    const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());
    const backup = new FileElementBackupAdapter(root, files);

    await backup.write(elementFixture());
    const first = await files.read('site-1');

    expect(first.templates.some((item) => item.id === 'Home')).toBe(true);
    expect((await files.read('other')).templates.some((item) => item.id === 'Home')).toBe(false);
    const directory = path.join(root, first.siteKey);

    await writeFile(path.join(directory, 'elements/templates/Home.json'),
      JSON.stringify(elementFixture({ siteId: 'other' })));
    await expect(files.read('site-1')).rejects.toThrow();
    const excluded = await files.readExcluding('site-1', [elementFixture()]);

    expect(excluded.templates.some((item) => item.id === 'Home')).toBe(false);
  });
});
