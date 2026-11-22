import {
  PublishRoutingReleaseUseCase,
} from '../../../src/app/use-cases/publication/publish-routing-release.use-case.js';
import { ReleaseState } from '../../../src/domain/publication/publication-release.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePublicationStore, FakeReleaseActivation } from '../../support/publication.js';
import { instant, siteFixture } from '../../support/sites.js';

describe('PublishRoutingRelease', () => {
  it('uses one captured active release, stages before activation and reconciles a lost acknowledgement', async () => {
    const store = new FakePublicationStore();
    const activation = new FakeReleaseActivation();

    store.records.set('old', {
      siteId: 'site-1',
      releaseId: 'old',
      state: ReleaseState.Ready,
      createdAt: instant,
      completedAt: instant,
      failure: null,
      manifest: { routes: [], artifacts: [] },
    });
    await activation.activate({
      siteId: 'site-1',
      releaseId: 'old',
      expectedActiveReleaseId: null,
      activatedAt:
      instant,
    });
    const build = { build: vi.fn(async () => ({ artifacts: [], manifest: { routes: [], artifacts: [] } })) };
    const access = { assertEditor: vi.fn(async () => undefined) };
    const originalActivate = activation.activate.bind(activation);
    const activate = vi.spyOn(activation, 'activate').mockImplementation(async (input) => {
      expect(store.records.get('new')?.state).toBe(ReleaseState.Ready);
      await originalActivate(input);
      throw new Error('Acknowledgement lost');
    });
    const operation = new PublishRoutingReleaseUseCase(access, { execute: async () => siteFixture() },
      { readUrls: async () => [] }, activation, store, build, {
        nextReleaseId: () => 'new',
        now: () => instant,
      }, fakeHookChanges);

    expect((await operation.execute({ siteId: 'site-1', actorId: 'editor' }))?.releaseId).toBe('new');
    expect(build.build).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledOnce();
    access.assertEditor.mockRejectedValueOnce(new Error('Denied'));
    await expect(operation.execute({ siteId: 'site-1', actorId: 'foreign' })).rejects.toThrow('Denied');
    expect(build.build).toHaveBeenCalledOnce();
  });
});
