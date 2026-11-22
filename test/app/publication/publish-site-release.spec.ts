import type { IRenderRuntime } from '../../../src/app/services/publication/render-data.service.js';
import { PublishSiteReleaseUseCase } from '../../../src/app/use-cases/publication/publish-site-release.use-case.js';
import type { IFrontendBuildPort } from '../../../src/ports/outbound/publication/frontend-build.port.js';
import type { ITemplateCompositionPort } from '../../../src/ports/outbound/publication/template-composition.port.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { source } from '../../support/publication.js';

describe('PublishSiteRelease', () => {
  const composition: ITemplateCompositionPort = { prepare: vi.fn(), compose: vi.fn() };
  const runtime: IRenderRuntime = { render: vi.fn() };
  const frontend: IFrontendBuildPort = {
    build: async () => ({
      artifacts: [],
      manifest: { routes: [], artifacts: [] },
    }),
  };

  it('stages complete output before activation and reconciles a lost activation acknowledgement', async () => {
    const at = new Date('2026-10-24T15:00:00Z');
    const result = { siteId: 'site-1', releaseId: 'release', activatedAt: at };
    const calls: string[] = [];
    const store = {
      stage: vi.fn(async () => {
        calls.push('stage');
      }),
      read: async () => null,
    };
    const activation = {
      getActive: async () => null,
      activate: vi.fn(async () => {
        calls.push('activate');
        throw new Error('Lost acknowledgement');
      }),
      findActivation: vi.fn(async () => result),
    };
    const operation = new PublishSiteReleaseUseCase({ assertEditor: async () => {} }, {
      capture: async () =>
        source('Hello'),
    }, composition, runtime, frontend, store, activation, {
      nextReleaseId: () => 'release',
      now: () => at,
    }, fakeHookChanges);

    expect(await operation.execute({
      siteId: 'site-1',
      actorId: 'owner',
      expectedActiveReleaseId: null,
    })).toEqual(result);
    expect(calls).toEqual(['stage', 'activate']);
    expect(activation.activate).toHaveBeenCalledOnce();
  });
  it('rejects a stale expected release before building', async () => {
    const capture = vi.fn();
    const operation = new PublishSiteReleaseUseCase({ assertEditor: async () => {} }, { capture },
      composition, runtime, frontend, { stage: vi.fn(), read: async () => null }, {
        getActive: async () => ({ siteId: 'site-1', releaseId: 'new', activatedAt: new Date() }),
        activate: vi.fn(),
        findActivation: async () => null,
      }, { nextReleaseId: () => 'unused', now: () => new Date() }, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', actorId: 'owner', expectedActiveReleaseId: null }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    expect(capture).not.toHaveBeenCalled();
  });
});
