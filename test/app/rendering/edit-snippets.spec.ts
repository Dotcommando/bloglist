import { CompleteElementSaveService } from '../../../src/app/services/rendering/complete-element-save.service.js';
import {
  CreateRenderingElementUseCase,
} from '../../../src/app/use-cases/rendering/create-rendering-element.use-case.js';
import {
  UpdateRenderingElementUseCase,
} from '../../../src/app/use-cases/rendering/update-rendering-element.use-case.js';
import { LoaderPhase } from '../../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../../src/domain/publication/render-plan.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { elementFixture, FakeElementStore } from '../../support/rendering.js';
import { siteFixture } from '../../support/sites.js';

describe('editable Snippet use cases with deterministic ports', () => {
  it('creates and updates code, contracts and backup atomically under the captured version', async () => {
    const store = new FakeElementStore();
    const backup = { write: vi.fn(async () => {}) };
    const sites = { execute: vi.fn(async () => siteFixture()) };
    const catalog = {
      list: async () => store.list('site-1'),
      find: (identity: Parameters<typeof store.find>[0]) =>
        store.find(identity),
    };
    const values = {
      nextId: () => 'snippet-id',
      nextVersion: vi.fn().mockReturnValueOnce('v1').mockReturnValue('v2'),
      now: () => new Date('2026-10-27T00:00:00Z'),
    };
    const persistence = new CompleteElementSaveService(store, backup, fakeHookChanges);
    const create = new CreateRenderingElementUseCase(sites, catalog, persistence, values,
      { reserve: async () => '1' });
    const input = elementFixture({
      kind: TemplateSourceKind.Snippet,
      html: '',
      name: 'Greeting',
      snippet: {
        code: 'return "Hello";',
        phases: [LoaderPhase.Build, LoaderPhase.Request],
        output: { name: 'result', kind: ParameterKind.String, required: true },
      },
    });
    const saved = await create.execute(input);

    expect(saved).toMatchObject({ key: '1', name: 'Greeting', backupState: 'Ready', snippet: input.snippet });
    const update = new UpdateRenderingElementUseCase(sites, catalog, store, persistence, values);
    const updated = await update.execute({
      ...saved,
      expectedVersion: saved.version,
      snippet: { ...saved.snippet!, code: 'return "Edited";' },
    });

    expect(updated.snippet?.code).toBe('return "Edited";');
    expect(backup.write).toHaveBeenCalledTimes(2);
    await expect(update.execute({ ...saved, expectedVersion: saved.version }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await expect(create.execute({ ...input, snippet: { ...input.snippet!, phases: [] } }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(create.execute({ ...input, kind: TemplateSourceKind.Template }))
      .rejects.toMatchObject({ code: 'Validation' });
  });
});
