import {
  ChangePublishedPageUrlUseCase,
} from '../../../src/app/use-cases/routing/change-published-page-url.use-case.js';
import { urlFixture, urlInput } from '../../support/routing.js';
import { instant } from '../../support/sites.js';

describe('ChangePublishedPageUrl', () => {
  it('checks trusted publication authority before changing working routing', async () => {
    const change = { execute: vi.fn() };
    const publish = { execute: vi.fn() };
    const operation = new ChangePublishedPageUrlUseCase(change, publish, {
      assertEditor: async () => {
        throw new Error('Denied');
      },
    });

    await expect(operation.execute({
      ...urlInput(), actorId: 'foreign', redirectStatus: 301,
    })).rejects.toThrow('Denied');
    expect(change.execute).not.toHaveBeenCalled();
    expect(publish.execute).not.toHaveBeenCalled();
  });
  it('publishes routing after the move and reports pending publication without repeating it', async () => {
    const change = { execute: vi.fn(async () => urlFixture()) };
    const publish = { execute: vi.fn(async () => ({ siteId: 'site-1', releaseId: 'new', activatedAt: instant })) };
    const operation = new ChangePublishedPageUrlUseCase(change, publish, { assertEditor: async () => undefined });
    const input = { ...urlInput(), actorId: 'editor', redirectStatus: 301 };

    expect((await operation.execute(input)).publication?.releaseId).toBe('new');
    publish.execute.mockRejectedValueOnce(new Error('Build failed'));
    expect(await operation.execute(input)).toMatchObject({ publication: null, publicationFailed: true });
    expect(change.execute).toHaveBeenCalledTimes(2);
    expect(publish.execute).toHaveBeenCalledTimes(2);
  });
});
