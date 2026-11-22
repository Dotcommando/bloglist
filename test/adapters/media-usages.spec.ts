import { MediaUsagesAdapter } from '../../src/adapters/outbound/media/references/media-usages.adapter.js';
import { MediaUsageGroup, MediaUsageTargetKind } from '../../src/domain/media/file-library.js';

describe('image usages', () => {
  it('finds stable TV file identities without confusing them with arbitrary text', async () => {
    const base = {
      group: MediaUsageGroup.Content,
      title: 'Page',
      field: 'tvValues',
      target: { kind: MediaUsageTargetKind.Page, id: 'page-1' },
      state: 'Draft',
    };
    const adapter = new MediaUsagesAdapter([{
      read: async () => [
        { ...base, text: '', fileIds: ['image'] },
        { ...base, field: 'unrelated', text: 'image', fileIds: ['different-image'] },
      ],
    }]);

    expect(await adapter.find('site-1', ['/assets/images/old.png'], 'image')).toEqual([base]);
  });

  it('matches exact literal URLs, encoded names, variants and historical paths across grouped sources', async () => {
    const source = {
      group: MediaUsageGroup.Content,
      title: 'Home',
      field: 'contentMd',
      target: { kind: MediaUsageTargetKind.Page, id: 'home' },
      state: 'Draft',
    };
    const read = vi.fn(async () => [
      { ...source, text: '<img src="/media/images/Фотографии/фото.png?cache=1">' },
      { ...source, field: 'not-an-image', text: '/media/images/Фотографии/фото.png.backup' },
      { ...source, group: MediaUsageGroup.OpenGraph, field: 'ogImage', text: 'https://example.test/media/images/old.png' },
    ]);
    const operation = new MediaUsagesAdapter([{ read }]);
    const usages = await operation.find('site-1', ['/media/images/' + encodeURIComponent('Фотографии') + '/'
      + encodeURIComponent('фото.png'), '/media/images/old.png']);

    expect(usages.map((usage) => usage.field)).toEqual(['contentMd', 'ogImage']);
    expect(read).toHaveBeenCalledWith('site-1');
  });
});
