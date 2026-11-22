import {
  PublishMediaAddressReleaseUseCase,
} from '../../../src/app/use-cases/publication/publish-media-address-release.use-case.js';
import { ReleaseState } from '../../../src/domain/publication/publication-release.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePublicationStore, FakeReleaseActivation } from '../../support/publication.js';
import { instant, siteFixture } from '../../support/sites.js';

it('revises only one captured publication and reconciles lost activation acknowledgements', async () => {
  const store = new FakePublicationStore();
  const activation = new FakeReleaseActivation();
  const old = {
    siteId: 'site-1',
    releaseId: 'old',
    state: ReleaseState.Ready,
    createdAt: instant,
    completedAt: instant,
    failure: null,
    manifest: { routes: [], artifacts: [] },
  };

  store.records.set('old', old);
  await activation.activate({
    siteId: 'site-1',
    releaseId: 'old',
    expectedActiveReleaseId: null,
    activatedAt: instant,
  });
  const build = {
    build: vi.fn(async () => ({ changed: true, artifacts: [], manifest: { routes: [], artifacts: [] } })),
  };
  const cache = { purge: vi.fn() };
  const access = { assertEditor: vi.fn(async () => {}) };
  const original = activation.activate.bind(activation);
  const activate = vi.spyOn(activation, 'activate').mockImplementation(async (input) => {
    expect(store.records.get('new')?.state).toBe(ReleaseState.Ready);
    await original(input);
    throw new Error('lost acknowledgement');
  });
  const operation = new PublishMediaAddressReleaseUseCase(access, { execute: async () => siteFixture() },
    activation, store, build, { nextReleaseId: () => 'new', now: () => instant }, fakeHookChanges, cache);
  const paths = [{ from: '/assets/images/old.png', to: '/assets/images/new.png' }];

  expect((await operation.execute({ siteId: 'site-1', actorId: 'editor', paths }))?.releaseId).toBe('new');
  expect(build.build).toHaveBeenCalledWith(expect.objectContaining({ previous: old, paths }));
  expect(activate).toHaveBeenCalledTimes(1);
  expect(cache.purge).toHaveBeenCalledExactlyOnceWith('site-1');
  access.assertEditor.mockRejectedValueOnce(new Error('denied'));
  await expect(operation.execute({ siteId: 'site-1', actorId: 'foreign', paths })).rejects.toThrow('denied');
  expect(build.build).toHaveBeenCalledTimes(1);
});

it('does not activate unaffected publications and never hides a rejected build', async () => {
  const store = new FakePublicationStore();
  const activation = new FakeReleaseActivation();
  const build = {
    build: vi.fn(async () => ({ changed: false, artifacts: [], manifest: { routes: [], artifacts: [] } })),
  };
  const cache = { purge: vi.fn() };
  const operation = new PublishMediaAddressReleaseUseCase({ assertEditor: async () => {} },
    { execute: async () => siteFixture() }, activation, store, build,
    { nextReleaseId: () => 'new', now: () => instant }, fakeHookChanges, cache);
  const input = {
    siteId: 'site-1',
    actorId: 'editor',
    paths: [{ from: '/assets/images/old.png', to: '/assets/images/new.png' }],
  };

  expect(await operation.execute(input)).toBeNull();
  expect(build.build).not.toHaveBeenCalled();
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
    activatedAt: instant,
  });
  expect((await operation.execute(input))?.releaseId).toBe('old');
  expect(store.records.has('new')).toBe(false);
  expect((await operation.execute({ ...input, paths: [], favicon: null }))?.releaseId).toBe('old');
  expect(build.build).toHaveBeenLastCalledWith(expect.objectContaining({ paths: [], favicon: null }));
  build.build.mockRejectedValueOnce(new Error('frozen source unavailable'));
  await expect(operation.execute(input)).rejects.toThrow('frozen source unavailable');
  expect((await activation.getActive('site-1'))?.releaseId).toBe('old');
  expect(cache.purge).toHaveBeenCalledTimes(2);
});
