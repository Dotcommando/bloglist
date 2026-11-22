import { vi } from 'vitest';

import { HookChangesService } from '../../src/app/services/hooks/hook-changes.service.js';
import { ProcessHookDeliveriesUseCase } from '../../src/app/use-cases/hooks/process-hook-deliveries.use-case.js';
import { HookDeliveryState, HookKind } from '../../src/domain/hooks/hook.js';
import type { IHookDelivery } from '../../src/domain/hooks/hook-execution.js';
import type { IHookDeliveryStorePort, IHookRuntimePort } from '../../src/ports/outbound/hooks/hook-execution.port.js';

const recipient = {
  subscriptionId: 'subscription',
  consumerId: 'handler',
  hookKey: 'cms.page.create.check',
  kind: HookKind.Check,
  priority: 0,
  versionId: 'frozen',
  addonKey: null,
  configuration: {},
  capabilities: [],
  retrySafe: true,
  deliveryMode: 'Event' as const,
};

describe('hook evaluation and command outcomes', () => {
  it('stops at a denial, records its outcome and does not issue a commit intent', async () => {
    const store = {
      capture: vi.fn(async () => ({
        installationId: 'install',
        scopeKey: 'site',
        siteId: 'site',
        generation: 'epoch',
        registryVersion: 'registry',
        recipients: [recipient, { ...recipient, subscriptionId: 'later', priority: 1 }],
      })),
      recordCheck: vi.fn(async () => {}),
    };
    const runtime = { evaluate: vi.fn(async () => ({ allow: false, reason: 'Page is used by a session' })) };
    const changes = new HookChangesService(store, runtime, { id: () => 'id', now: () => new Date(0) });

    await expect(changes.prepare({
      siteId: 'site',
      actorId: 'admin',
      subject: 'page',
      checkKey: recipient.hookKey,
      candidate: {},
      facts: [{ hookKey: 'cms.page.created', payload: {} }],
    }))
      .rejects.toThrow('Page is used by a session');
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(store.recordCheck).toHaveBeenCalledWith(expect.anything(), recipient, 'id',
      expect.objectContaining({ allow: false }), null);
  });

  it('resumes frozen receipts and blocks new effects when plan persistence fails', async () => {
    const commands = [{ key: 'done', name: 'addon.test.done', arguments: {} }, {
      key: 'next',
      name:
      'addon.test.next',
      arguments: {},
    }];
    const delivery: IHookDelivery = {
      deliveryId: 'delivery',
      siteId: 'site',
      generation: 'epoch',
      eventId: 'event',
      hookKey: 'cms.page.created',
      actorId: 'admin',
      chainId: 'chain',
      causalDepth: 0,
      recipient: { ...recipient, kind: HookKind.Event, capabilities: ['addon.test.done', 'addon.test.next'] },
      input: {},
      state: HookDeliveryState.Running,
      attemptCount: 2,
      ownerToken: 'owner',
      plan: commands,
    };
    let claimed = false;
    const store: IHookDeliveryStorePort = {
      dispatch: vi.fn(async () => 0),
      claim: vi.fn(async () => {
        if (claimed) {
          return null;
        }
        claimed = true;

        return delivery;
      }),
      preparePlan: vi.fn(async (_delivery, plan) => plan),
      commandSucceeded: vi.fn(async (_delivery, command) => command.key === 'done'),
      beginCommand: vi.fn(async () => {}),
      finishCommand: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      history: vi.fn(async () => []),
      retry: vi.fn(async () => {}),
      skip: vi.fn(async () => {}),
    };
    const runtime: IHookRuntimePort = { evaluate: vi.fn(async () => ({ commands: [] })) };
    const executor = { execute: vi.fn(async () => ({ confirmed: true, retrySafe: true, result: {} })) };

    await new ProcessHookDeliveriesUseCase(store, runtime, executor).execute({ maximum: 5 });
    expect(runtime.evaluate).not.toHaveBeenCalled();
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledWith(delivery, commands[1], 'delivery:next');
    expect(store.complete).toHaveBeenCalledWith(delivery);

    const fresh = { ...delivery, plan: null };

    vi.mocked(store.claim).mockResolvedValueOnce(fresh);
    vi.mocked(runtime.evaluate).mockResolvedValueOnce({ commands: [commands[1]!] });
    vi.mocked(store.preparePlan).mockRejectedValueOnce(new Error('Synthetic plan storage failure'));
    vi.mocked(executor.execute).mockClear();
    vi.mocked(store.complete).mockClear();
    await new ProcessHookDeliveriesUseCase(store, runtime, executor).execute({ maximum: 5 });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(store.beginCommand).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(fresh, 'Hook execution failed', false);
  });
});
