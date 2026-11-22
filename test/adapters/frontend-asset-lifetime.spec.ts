import { createHash } from 'node:crypto';
import type * as FileSystem from 'node:fs/promises';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import type { IFrontendBuildInput } from '../../src/ports/outbound/publication/frontend-build.port.js';
import { source } from '../support/publication.js';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof FileSystem>();

  return { ...fs, readFile: vi.fn(fs.readFile), realpath: vi.fn(fs.realpath) };
});

function input(html: string): IFrontendBuildInput {
  const snapshot = source('ignored');

  return {
    releaseId: 'release',
    snapshot: { ...snapshot, frontendSources: [{ id: 'site', revision: '1', css: '', browserTypeScript: null }] },
    requestPlans: [],
    documents: [{ pageId: snapshot.pages[0]!.pageId, html, frontendSourceIds: ['site'] }],
  };
}

it('keeps authored binary assets lazy and transfers them in bounded chunks with matching metadata', async () => {
  const root = await mkdtemp(path.resolve('.tmp/frontend-asset-stream-'));

  if (!root.startsWith(path.resolve('.tmp') + path.sep)) {
    throw new Error('Unexpected test root');
  }

  const filename = path.join(root, 'large.svg');
  const bytes = new TextEncoder().encode('<svg><!--' + 'x'.repeat(2 * 1024 * 1024) + '--></svg>');

  await writeFile(filename, bytes);
  vi.mocked(readFile).mockClear();
  const frontend = new FrontendBuildAdapter(undefined, { directory: () => root }, { toMarkdown: () => 'Image' });

  try {
    const built = await frontend.build(input('<html><head></head><body>'
      + '<img src="./large.svg" width="2" height="2"></body></html>'));
    const media = built.artifacts.find((file) => file.path.startsWith('assets/media/'));

    if (!media) {
      throw new Error('Expected the referenced public asset');
    }
    expect(vi.mocked(readFile).mock.calls.filter(([target]) => String(target) === filename)).toEqual([]);
    expect(media).toMatchObject({
      byteSize: bytes.length,
      mimeType: 'image/svg+xml',
      public: true,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    });
    const hash = createHash('sha256');
    let total = 0;

    for await (const chunk of media.content.bytes) {
      expect(chunk.byteLength).toBeLessThanOrEqual(64 * 1024);
      total += chunk.byteLength;
      hash.update(chunk);
    }
    expect(total).toBe(bytes.length);
    expect(hash.digest('hex')).toBe(media.checksum);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('validates all HTML nodes before starting asynchronous local asset work', async () => {
  const native = await vi.importActual<typeof FileSystem>('node:fs/promises');
  const root = path.resolve('.tmp/not-read-before-validation');
  const frontend = new FrontendBuildAdapter(undefined, { directory: () => root }, { toMarkdown: () => '' });

  vi.mocked(realpath).mockClear();
  vi.mocked(realpath).mockRejectedValueOnce(new Error('Asset lookup must not start'));

  try {
    await expect(frontend.build(input('<html><head></head><body>'
      + '<img src="./first.svg" width="2" height="2"><img src="./invalid.svg"></body></html>')))
      .rejects.toThrow('Images require actual width and height');
    expect(realpath).not.toHaveBeenCalled();
  } finally {
    vi.mocked(realpath).mockReset().mockImplementation(native.realpath);
  }
});
