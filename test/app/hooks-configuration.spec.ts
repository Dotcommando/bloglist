import { vi } from 'vitest';

import { ApplyHookHandlerUseCase } from '../../src/app/use-cases/hooks/apply-hook-handler.use-case.js';
import { CreateHookHandlerUseCase } from '../../src/app/use-cases/hooks/create-hook-handler.use-case.js';
import { SaveHookSubscriptionUseCase } from '../../src/app/use-cases/hooks/save-hook-subscription.use-case.js';
import { SetHookHandlerEnabledUseCase } from '../../src/app/use-cases/hooks/set-hook-handler-enabled.use-case.js';
import { UpdateHookHandlerUseCase } from '../../src/app/use-cases/hooks/update-hook-handler.use-case.js';
import { HookKind } from '../../src/domain/hooks/hook.js';
import { HookConfigurationFake } from '../support/hooks.js';

function fixture(): {
  store: HookConfigurationFake;
  access: { requireAdministrator(siteId: string, actorId: string): Promise<void> };
  values: { id(): string; now(): Date };
  compiler: { compile(source: string): Promise<{ compiledJavaScript: string; digest: string }> };
  actor: { siteId: string; actorId: string };
  create: CreateHookHandlerUseCase;
} {
  let next = 0;
  const store = new HookConfigurationFake();
  const access = { requireAdministrator: vi.fn(async () => {}) };
  const values = { id: () => 'id-' + ++next, now: () => new Date('2026-10-29T00:00:00Z') };
  const compiler = { compile: vi.fn(async () => ({ compiledJavaScript: 'compiled', digest: 'a'.repeat(64) })) };
  const actor = { siteId: 'site-a', actorId: 'admin' };

  return { store, access, values, compiler, actor, create: new CreateHookHandlerUseCase(store, access, values) };
}

describe('hook source and binding workflows', () => {
  it('saves drafts without activating code and applies an immutable captured version', async () => {
    const f = fixture();
    const created = await f.create.execute({
      ...f.actor,
      title: 'React',
      kind: HookKind.Event,
      draft: { source: 'return {commands: []};', capabilities: [] },
    });

    expect(created.enabled).toBe(false);
    expect(created.activeVersionId).toBeNull();
    const applied = await new ApplyHookHandlerUseCase(f.store, f.access, f.values, f.compiler)
      .execute({ ...f.actor, handlerId: created.handlerId, expectedVersion: created.version });
    const active = (await f.store.handler(f.actor.siteId, created.handlerId))!;
    const edited = await new UpdateHookHandlerUseCase(f.store, f.access, f.values).execute({
      ...f.actor,
      handlerId: created.handlerId,
      expectedVersion: active.version,
      title: 'React differently',
      draft: { source: 'return {commands: [{key:"x",name:"cms.page.archive",arguments:{}}]};', capabilities: [] },
    });

    expect(edited.activeVersionId).toBe(applied.versionId);
    expect(await f.store.version(f.actor.siteId, applied.versionId)).toEqual(applied);
    expect(applied.source).toBe(created.draft.source);
    await expect(new ApplyHookHandlerUseCase(f.store, f.access, f.values, f.compiler)
      .execute({ ...f.actor, handlerId: created.handlerId, expectedVersion: active.version }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
  });

  it('rejects enabling unapplied code and does not expose another site handler', async () => {
    const f = fixture();
    const handler = await f.create.execute({
      ...f.actor,
      title: 'React',
      kind: HookKind.Event,
      draft: { source: 'return {commands: []};', capabilities: [] },
    });
    const enable = new SetHookHandlerEnabledUseCase(f.store, f.access, f.values);

    await expect(enable.execute({
      ...f.actor,
      handlerId: handler.handlerId,
      expectedVersion: handler.version,
      enabled: true,
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(enable.execute({
      ...f.actor,
      siteId: 'foreign',
      handlerId: handler.handlerId,
      expectedVersion: handler.version,
      enabled: true,
    })).rejects.toMatchObject({ code: 'NotFound' });
    expect(f.store.handlers.get(handler.handlerId)?.enabled).toBe(false);
  });

  it('rejects a binding with an incompatible hook kind before persisting it', async () => {
    const f = fixture();
    const handler = await f.create.execute({
      ...f.actor,
      title: 'Check',
      kind: HookKind.Check,
      draft: { source: 'return {allow: true};', capabilities: [] },
    });

    await expect(new SaveHookSubscriptionUseCase(f.store, f.access, f.values).execute({
      ...f.actor,
      expectedVersion: null,
      subscription: {
        subscriptionId: '',
        hookKey: 'cms.page.created',
        schemaVersion: 1,
        kind: HookKind.Event,
        title: 'Bad binding',
        handlerId: handler.handlerId,
        addonKey: null,
        handlerKey: null,
        ownerKind: 'User',
        configuration: {},
        filters: {},
        enabled: false,
        priority: 0,
        retrySafe: false,
        deliveryMode: 'Event',
        manifestKey: null,
      },
    })).rejects.toMatchObject({ code: 'Validation' });
    expect(f.store.subscriptions.size).toBe(0);
  });
});
