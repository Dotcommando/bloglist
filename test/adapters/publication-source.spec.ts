import { PublicationSourceAdapter } from '../../src/adapters/outbound/publication/files/publication-source.adapter.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { source } from '../support/publication.js';
import { siteFixture } from '../support/sites.js';

describe('publication current source capture', () => {
  it('captures the explicitly selected development origin for publication', async () => {
    const fixture = source('hello');
    const site = siteFixture();

    site.changeAddresses({
      publicOrigin: 'https://example.test',
      localOrigin: 'http://localhost:3100',
      originMode: SiteOriginMode.Local,
    });
    const adapter = new PublicationSourceAdapter({ read: async () => fixture },
      { readWorking: async () => fixture.pages[0]!, readPublished: async () => fixture.pages },
      { readUrls: async () => [] }, { execute: async () => site });

    expect((await adapter.capture('site-1')).publicOrigin).toBe('http://localhost:3100');
  });
  it('captures current favicon metadata and disposes its snapshot before returning', async () => {
    const fixture = source('hello');
    const icon = {
      byteSize: 100,
      width: 32,
      height: 32,
      version: 'a'.repeat(64),
      content: {
        byteSize: 100,
        mimeType: 'image/x-icon',
        bytes: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            yield new Uint8Array(100);
          },
        },
      },
      dispose: vi.fn(async () => {}),
    };
    const favicons = { read: vi.fn(async () => icon) };
    const adapter = new PublicationSourceAdapter({ read: async () => fixture },
      { readWorking: async () => fixture.pages[0]!, readPublished: async () => fixture.pages },
      { readUrls: async () => [] }, { execute: async () => siteFixture() }, favicons);

    expect((await adapter.capture('site-1')).favicon).toEqual({
      byteSize: 100, width: 32, height: 32, version: 'a'.repeat(64),
    });
    expect(icon.dispose).toHaveBeenCalledOnce();
    icon.dispose.mockRejectedValueOnce(new Error('cleanup rejected'));
    await expect(adapter.capture('site-1')).rejects.toThrow('cleanup rejected');
  });
  it('captures only the configured public origin and never publishes the local development address', async () => {
    const fixture = source('hello');
    const site = siteFixture();

    site.changeAddresses({ publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100' });
    const adapter = new PublicationSourceAdapter({ read: async () => fixture },
      { readWorking: async () => fixture.pages[0]!, readPublished: async () => fixture.pages },
      { readUrls: async () => [] }, { execute: async () => site });
    const snapshot = await adapter.capture('site-1');

    expect(snapshot.publicOrigin).toBe('https://example.test');
    expect(JSON.stringify(snapshot)).not.toContain('localhost:3100');
  });
  it('uses working content only for preview and published versions for release', async () => {
    const fixture = source('Hello');
    const working = vi.fn(async () => fixture.pages[0]!);
    const published = vi.fn(async () => fixture.pages);
    const adapter = new PublicationSourceAdapter({ read: async () => fixture },
      { readWorking: working, readPublished: published }, { readUrls: async () => [] },
      { execute: async () => siteFixture() });

    expect((await adapter.capture('site-1', 'page-1')).pages).toHaveLength(1);
    expect(published).toHaveBeenCalledWith('site-1');
    expect((await adapter.capture('site-1')).pages).toHaveLength(1);
    expect(published).toHaveBeenCalledWith('site-1');
    await expect(adapter.capture('foreign')).rejects.toThrow();
  });
});
