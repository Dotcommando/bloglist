import { PublishCurrentPageUseCase } from '../../../src/app/use-cases/publication/publish-current-page.use-case.js';
import { pageFixture } from '../../support/pages.js';

describe('PublishCurrentPage setup and publication', () => {
  it('configures an explicitly chosen template and URL before publishing the page', async () => {
    const page = pageFixture();
    const calls: string[] = [];
    const configure = {
      execute: vi.fn(async () => {
        calls.push('configure');

        return page;
      }),
    };
    const assign = {
      execute: vi.fn(async () => {
        calls.push('url');
        throw new Error('URL conflict');
      }),
    };
    const publish = { execute: vi.fn() };
    const operation = new PublishCurrentPageUseCase({ execute: async () => page }, configure, assign,
      { readUrls: async () => [] },
      { nextUrlId: () => 'url', nextUrlMark: () => 'HomeUrl', currentInstant: () => new Date() }, publish);

    await expect(operation.execute({
      siteId: 'site-1',
      pageId: 'page-1',
      actorId: 'owner',
      templateId: 'Basic',
      path: '/',
    }))
      .rejects.toThrow('URL conflict');
    expect(calls).toEqual(['configure', 'url']);
    expect(assign.execute).toHaveBeenCalledWith(expect.objectContaining({
      path: '/',
      segment: '/',
      parentUrlId: null,
    }));
    expect(publish.execute).not.toHaveBeenCalled();
  });
  it('does not invent a URL or template for an unconfigured page', async () => {
    const configure = { execute: vi.fn() };
    const publish = { execute: vi.fn() };
    const operation = new PublishCurrentPageUseCase({ execute: async () => pageFixture() }, configure,
      { execute: vi.fn() }, { readUrls: async () => [] },
      { nextUrlId: () => 'url', nextUrlMark: () => 'HomeUrl', currentInstant: () => new Date() }, publish);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1', actorId: 'owner' })).rejects.toThrow();
    expect(configure.execute).not.toHaveBeenCalled();
    expect(publish.execute).not.toHaveBeenCalled();
  });
});
