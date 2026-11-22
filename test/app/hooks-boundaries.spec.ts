import { ApplyHookHandlerUseCase } from '../../src/app/use-cases/hooks/apply-hook-handler.use-case.js';
import { CreateHookHandlerUseCase } from '../../src/app/use-cases/hooks/create-hook-handler.use-case.js';
import { GetHookHandlerUseCase } from '../../src/app/use-cases/hooks/get-hook-handler.use-case.js';
import { GetHookHistoryUseCase } from '../../src/app/use-cases/hooks/get-hook-history.use-case.js';
import { ListHooksUseCase } from '../../src/app/use-cases/hooks/list-hooks.use-case.js';
import { ReorderHookSubscriptionsUseCase } from '../../src/app/use-cases/hooks/reorder-hook-subscriptions.use-case.js';
import { RetryHookDeliveryUseCase } from '../../src/app/use-cases/hooks/retry-hook-delivery.use-case.js';
import { SaveHookSubscriptionUseCase } from '../../src/app/use-cases/hooks/save-hook-subscription.use-case.js';
import { SetHookHandlerEnabledUseCase } from '../../src/app/use-cases/hooks/set-hook-handler-enabled.use-case.js';
import { SkipHookDeliveryUseCase } from '../../src/app/use-cases/hooks/skip-hook-delivery.use-case.js';
import { UpdateHookHandlerUseCase } from '../../src/app/use-cases/hooks/update-hook-handler.use-case.js';
import { HookKind } from '../../src/domain/hooks/hook.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IHookAccessPort, IHookCompilerPort, IHookValuesPort } from
  '../../src/ports/outbound/hooks/hook-configuration.port.js';
import type { IHookDeliveryStorePort } from '../../src/ports/outbound/hooks/hook-execution.port.js';
import { HookConfigurationFake } from '../support/hooks.js';

interface IFixture {
  store: HookConfigurationFake;
  access: IHookAccessPort;
  compiler: IHookCompilerPort;
  values: IHookValuesPort;
  deliveries: IHookDeliveryStorePort;
}

interface IProtectedCase {
  name: string;
  run(fixture: IFixture): Promise<unknown>;
}

const actor = { siteId: 'site', actorId: 'admin' };

const reference = { ...actor, handlerId: 'handler', expectedVersion: 'v1' };

const draft = { source: 'return {commands: []};', capabilities: [] };

const cases: readonly IProtectedCase[] = [
  {
    name: 'create',
    run: f => new CreateHookHandlerUseCase(f.store, f.access, f.values)
      .execute({ ...actor, title: 'React', kind: HookKind.Event, draft }),
  },
  {
    name: 'update',
    run: f => new UpdateHookHandlerUseCase(f.store, f.access, f.values)
      .execute({ ...reference, title: 'React', draft }),
  },
  { name: 'apply', run: f => new ApplyHookHandlerUseCase(f.store, f.access, f.values, f.compiler).execute(reference) },
  {
    name: 'enable',
    run: f => new SetHookHandlerEnabledUseCase(f.store, f.access, f.values)
      .execute({ ...reference, enabled: true }),
  },
  { name: 'get', run: f => new GetHookHandlerUseCase(f.store, f.access).execute(reference) },
  { name: 'list', run: f => new ListHooksUseCase(f.store, f.access).execute(actor) },
  { name: 'history', run: f => new GetHookHistoryUseCase(f.deliveries, f.access).execute(actor) },
  {
    name: 'retry',
    run: f => new RetryHookDeliveryUseCase(f.deliveries, f.access)
      .execute({ ...actor, deliveryId: 'delivery', version: 'v1' }),
  },
  {
    name: 'skip',
    run: f => new SkipHookDeliveryUseCase(f.deliveries, f.access)
      .execute({ ...actor, deliveryId: 'delivery', version: 'v1', reason: 'No effect' }),
  },
  {
    name: 'reorder',
    run: f => new ReorderHookSubscriptionsUseCase(f.store, f.access)
      .execute({ ...actor, hookKey: 'cms.page.created', ordered: [] }),
  },
  {
    name: 'subscribe',
    run: f => new SaveHookSubscriptionUseCase(f.store, f.access, f.values).execute({
      ...actor,
      expectedVersion: null,
      subscription: {
        subscriptionId: '',
        hookKey: 'cms.page.created',
        schemaVersion: 1,
        title: 'React',
        kind: HookKind.Event,
        handlerId: 'handler',
        addonKey: null,
        handlerKey: null,
        ownerKind: 'User',
        configuration: {},
        filters: {},
        enabled: true,
        priority: 0,
        retrySafe: false,
        deliveryMode: 'Event',
        manifestKey: null,
      },
    }),
  },
];

function fixture(): IFixture {
  return {
    store: new HookConfigurationFake(),
    access: { requireAdministrator: vi.fn(async () => {}) },
    compiler: { compile: vi.fn(async () => ({ compiledJavaScript: 'compiled', digest: 'a'.repeat(64) })) },
    values: { id: () => 'generated', now: () => new Date(0) },
    deliveries: {
      dispatch: vi.fn(async () => 0),
      claim: vi.fn(async () => null),
      preparePlan: vi.fn(async (_delivery, plan) => plan),
      commandSucceeded: vi.fn(async () => false),
      beginCommand: vi.fn(async () => {}),
      finishCommand: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      history: vi.fn(async () => []),
      retry: vi.fn(async () => {}),
      skip: vi.fn(async () => {}),
    },
  };
}

it.each(cases)('authorizes $name before private reads, compilation or mutations', async scenario => {
  const f = fixture();
  const denied = new BusinessError(BusinessErrorCode.Forbidden, 'Denied');
  const storage = [
    vi.spyOn(f.store, 'tree'),
    vi.spyOn(f.store, 'handler'),
    vi.spyOn(f.store, 'saveHandler'),
    vi.spyOn(f.store, 'apply'),
    vi.spyOn(f.store, 'saveSubscription'),
    vi.spyOn(f.store, 'reorder'),
  ];

  vi.mocked(f.access.requireAdministrator).mockRejectedValueOnce(denied);
  await expect(scenario.run(f)).rejects.toBe(denied);
  expect(f.access.requireAdministrator).toHaveBeenCalledExactlyOnceWith('site', 'admin');

  for (const call of storage) {
    expect(call).not.toHaveBeenCalled();
  }
  expect(f.compiler.compile).not.toHaveBeenCalled();
  expect(f.deliveries.history).not.toHaveBeenCalled();
  expect(f.deliveries.retry).not.toHaveBeenCalled();
  expect(f.deliveries.skip).not.toHaveBeenCalled();
});

it('scopes handler reads and delivery recovery to the requested site and captured versions', async () => {
  const f = fixture();
  const get = new GetHookHandlerUseCase(f.store, f.access);

  await expect(get.execute({ ...actor, handlerId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
  await new GetHookHistoryUseCase(f.deliveries, f.access).execute(actor);
  await new RetryHookDeliveryUseCase(f.deliveries, f.access)
    .execute({ ...actor, deliveryId: 'delivery', version: 'captured' });
  await new SkipHookDeliveryUseCase(f.deliveries, f.access)
    .execute({ ...actor, deliveryId: 'delivery', version: 'captured', reason: 'Known no effect' });
  expect(f.deliveries.history).toHaveBeenCalledExactlyOnceWith('site');
  expect(f.deliveries.retry).toHaveBeenCalledExactlyOnceWith('site', 'delivery', 'captured');
  expect(f.deliveries.skip).toHaveBeenCalledExactlyOnceWith('site', 'delivery', 'captured', 'Known no effect');
  vi.mocked(f.deliveries.retry).mockRejectedValueOnce(new BusinessError(BusinessErrorCode.StaleWrite, 'Changed'));
  await expect(new RetryHookDeliveryUseCase(f.deliveries, f.access)
    .execute({ ...actor, deliveryId: 'delivery', version: 'captured' })).rejects.toMatchObject({ code: 'StaleWrite' });
  vi.mocked(f.deliveries.skip).mockClear();
  await expect(new SkipHookDeliveryUseCase(f.deliveries, f.access)
    .execute({ ...actor, deliveryId: 'delivery', version: 'captured', reason: ' ' }))
    .rejects.toMatchObject({ code: 'Validation' });
  expect(f.deliveries.skip).not.toHaveBeenCalled();
});

it('preserves the saved draft and applied version when compilation fails', async () => {
  const f = fixture();
  const handler = await new CreateHookHandlerUseCase(f.store, f.access, f.values).execute({
    ...actor, kind: HookKind.Event, title: 'React', draft,
  });
  const before = structuredClone(handler);
  const failure = new Error('Synthetic compiler failure');

  vi.mocked(f.compiler.compile).mockRejectedValueOnce(failure);
  await expect(new ApplyHookHandlerUseCase(f.store, f.access, f.values, f.compiler).execute({
    ...actor, handlerId: handler.handlerId, expectedVersion: handler.version,
  })).rejects.toBe(failure);
  expect(await f.store.handler(actor.siteId, handler.handlerId)).toEqual(before);
  expect(f.store.versions.size).toBe(0);
});
