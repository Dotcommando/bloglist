import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { mergeDumpElements } from '../../src/adapters/outbound/backup/files/partial-dump-elements.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { elementFixture } from '../support/rendering.js';

describe('portable selected source import', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.resolve('.tmp/partial-elements-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('replaces a same-name target while preserving its identity/key and imports only checked rows', async () => {
    const existing = elementFixture({
      siteId: 'target',
      key: '9',
      elementId: 'existing',
      name: 'Header',
      kind: TemplateSourceKind.Chunk,
      html: '<p>old</p>',
    });
    const imported = elementFixture({
      siteId: 'source',
      key: '2',
      elementId: 'source-header',
      name: 'Header',
      kind: TemplateSourceKind.Chunk,
      html: '<p>new</p>',
    });
    const unchecked = { ...imported, elementId: 'unchecked', name: 'Unchecked' };
    const sources = path.join(root, 'sources');

    await mkdir(path.join(sources, 'Target'), { recursive: true });
    await writeFile(path.join(sources, 'Target', 'site.config.json'), JSON.stringify({ siteId: 'target' }));
    const result = await mergeDumpElements('target', [existing], [imported, unchecked],
      [{ id: imported.elementId, targetId: existing.elementId }], sources);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ elementId: 'existing', key: '9', siteId: 'target', html: '<p>new</p>' });
    expect(await readFile(path.join(sources, 'Target', 'elements', 'chunks', 'Header.json'),
      'utf8')).toContain('<p>new</p>');
  });

  it('requires an explicit target when several target elements have the same name', async () => {
    const first = elementFixture({ siteId: 'target', key: '1', name: 'Repeated' });
    const second = { ...first, key: '2', elementId: 'other' };
    const source = { ...first, siteId: 'source', elementId: 'imported' };

    await expect(mergeDumpElements('target', [first, second], [source],
      [{ id: source.elementId, targetId: null }], path.join(root, 'sources')))
      .rejects.toMatchObject({ code: 'Conflict' });
  });
});
