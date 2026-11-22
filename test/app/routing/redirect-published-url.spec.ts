import { RedirectPublishedUrlUseCase } from '../../../src/app/use-cases/routing/redirect-published-url.use-case.js';
import { urlFixture } from '../../support/routing.js';
import { instant } from '../../support/sites.js';

const input = {
  siteId: 'site-1',
  actorId: 'editor',
  urlId: 'url-old',
  expectedVersion: 'v1',
  targetUrlId: 'target',
  redirectStatus: 301,
};

describe('RedirectPublishedUrl', () => {
  it('authorizes before saving and never publishes a failed redirect mutation', async () => {
    const redirect = { execute: vi.fn(async () => urlFixture()) };
    const publish = { execute: vi.fn(async () => null) };
    const access = { assertEditor: vi.fn(async () => undefined) };
    const operation = new RedirectPublishedUrlUseCase(redirect, publish, access);

    access.assertEditor.mockRejectedValueOnce(new Error('Denied'));
    await expect(operation.execute(input)).rejects.toThrow('Denied');
    expect(redirect.execute).not.toHaveBeenCalled();
    redirect.execute.mockRejectedValueOnce(new Error('Stale URL'));
    await expect(operation.execute(input)).rejects.toThrow('Stale URL');
    expect(publish.execute).not.toHaveBeenCalled();
  });
  it('applies saved redirect routing and reports publication failure without replaying the mutation', async () => {
    const redirect = { execute: vi.fn(async () => urlFixture()) };
    const publish = { execute: vi.fn(async () => ({ siteId: 'site-1', releaseId: 'new', activatedAt: instant })) };
    const operation = new RedirectPublishedUrlUseCase(redirect, publish, { assertEditor: async () => undefined });

    expect(await operation.execute(input)).toMatchObject({
      publication: { releaseId: 'new' }, publicationFailed: false,
    });
    expect(redirect.execute).toHaveBeenCalledWith(input);
    expect(publish.execute).toHaveBeenCalledWith({ siteId: 'site-1', actorId: 'editor' });
    expect(redirect.execute.mock.invocationCallOrder[0]).toBeLessThan(publish.execute.mock.invocationCallOrder[0]!);
    publish.execute.mockRejectedValueOnce(new Error('Activation failed'));
    expect(await operation.execute(input)).toMatchObject({ publication: null, publicationFailed: true });
    expect(redirect.execute).toHaveBeenCalledTimes(2);
    expect(publish.execute).toHaveBeenCalledTimes(2);
  });
  it('keeps working routing when the site has no active publication', async () => {
    const operation = new RedirectPublishedUrlUseCase({ execute: async () => urlFixture() },
      { execute: async () => null }, { assertEditor: async () => undefined });

    expect(await operation.execute(input)).toMatchObject({ publication: null, publicationFailed: false });
  });
});
