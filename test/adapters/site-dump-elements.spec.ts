import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { reconcileDumpElements, validateDumpConfigs } from '../../src/adapters/outbound/backup/files/dump-elements.js';
import { databaseRecords, encodeDocument } from '../../src/adapters/outbound/backup/mongoose/dump-database.adapter.js';
import { FileElementBackupAdapter } from '../../src/adapters/outbound/rendering/files/element-backup.adapter.js';
import { FileRenderingSourceAdapter } from '../../src/adapters/outbound/rendering/files/rendering-source.adapter.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { ElementBackupState } from '../../src/domain/rendering/rendering-element.js';
import { elementFixture } from '../support/rendering.js';

describe('site dump source reconciliation', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.resolve('.tmp/dump-elements-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rebuilds missing or stale copies from database sources and marks regenerated copies ready in DB', async () => {
    const sources = path.join(root, 'sources');
    const documents = path.join(root, 'documents.jsonl');
    const element = elementFixture({
      key: '1',
      name: 'DB chunk',
      kind: TemplateSourceKind.Chunk,
      html: '<p>Database content</p>',
      backupState: ElementBackupState.Pending,
    });
    const { elementId, ...fields } = element;

    await writeFile(documents, JSON.stringify({
      collection: 'rendering_elements',
      bytes: encodeDocument({ _id: elementId, ...fields }),
    }) + '\n');
    const backup = new FileElementBackupAdapter(sources, new FileRenderingSourceAdapter(sources));

    await backup.write({ ...element, html: '<p>Stale file</p>' });
    await reconcileDumpElements(sources, element.siteId, documents);
    const match = await new FileRenderingSourceAdapter(sources).locate(element.siteId);

    expect(await readFile(path.join(sources, match!.key, 'elements', 'chunks', 'DB chunk.json'), 'utf8'))
      .toContain('Database content');
    const records = [];

    for await (const row of databaseRecords(documents)) {
      records.push(row);
    }
    expect(records[0]?.document.backupState).toBe(ElementBackupState.Ready);
  });

  it('rejects executable imported config without evaluating it', async () => {
    await mkdir(path.join(root, 'Example'));
    await writeFile(path.join(root, 'Example', 'site.config.ts'),
      'export default { siteId: process.env.PRIVATE_VALUE };');
    await expect(validateDumpConfigs(root)).rejects.toThrow('literal data');
  });
});
