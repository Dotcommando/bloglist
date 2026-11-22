import { HookRecipientsService } from '../../src/app/services/hooks/hook-recipients.service.js';
import {
  HookKind, HookScopeKind, type IHookHandler, type IHookHandlerVersion, type IHookSubscription,
} from '../../src/domain/hooks/hook.js';
import type {
  IHookAddonBinding, IHookRecipientSourcePort,
} from '../../src/ports/outbound/hooks/hook-recipient-source.port.js';
import { HookConfigurationFake } from '../support/hooks.js';

const at = new Date('2026-01-01T00:00:00Z');

const handler: IHookHandler = {
  handlerId: 'handler',
  siteId: 'site',
  title: 'Handler',
  kind: HookKind.Event,
  draft: { source: 'return {};', capabilities: [] },
  activeVersionId: 'applied',
  enabled: true,
  version: 'h1',
  createdAt: at,
  updatedAt: at,
  createdBy: 'admin',
  updatedBy: 'admin',
};

const version: IHookHandlerVersion = {
  versionId: 'applied',
  siteId: 'site',
  handlerId: 'handler',
  sourceDraftVersion: 'h1',
  source: 'return {};',
  compiledJavaScript: '',
  digest: 'digest',
  kind: HookKind.Event,
  capabilities: ['cms.page.update'],
  appliedAt: at,
  appliedBy: 'admin',
};

const subscription: IHookSubscription = {
  subscriptionId: 'user',
  siteId: 'site',
  hookKey: 'cms.page.created',
  schemaVersion: 1,
  kind: HookKind.Event,
  title: 'Binding',
  handlerId: 'handler',
  addonKey: null,
  handlerKey: null,
  ownerKind: 'User',
  configuration: { value: 1 },
  filters: { type: 'selected' },
  enabled: true,
  priority: 2,
  retrySafe: true,
  deliveryMode: 'Event',
  manifestKey: null,
  version: 's1',
  createdAt: at,
  updatedAt: at,
  createdBy: 'admin',
  updatedBy: 'admin',
};

function fixture(): { store: HookConfigurationFake;
  bindings: IHookAddonBinding[];
  source: IHookRecipientSourcePort;
  select: HookRecipientsService } {
  const store = new HookConfigurationFake();

  store.handlers.set(handler.handlerId, handler);
  store.versions.set(version.versionId, version);
  store.subscriptions.set(subscription.subscriptionId, subscription);
  const bindings: IHookAddonBinding[] = [];
  const source: IHookRecipientSourcePort = {
    tree: (siteId) => store.tree(siteId),
    version: (siteId, id) => store.version(siteId, id),
    addonEnabled: vi.fn(async () => true),
    addons: async () => bindings,
  };

  return { store, bindings, source, select: new HookRecipientsService(source) };
}

function addon(hookKey = 'cms.page.created', scopeKind = HookScopeKind.Site): IHookAddonBinding {
  return {
    definition: {
      hookKey,
      scopeKind,
      schemaVersion: 1,
      kind: HookKind.Event,
      provider: 'cms',
      title: '',
      description: '',
    },
    recipient: {
      subscriptionId: 'addon',
      consumerId: 'consumer',
      hookKey,
      kind: HookKind.Event,
      priority: 1,
      versionId: 'addon-version',
      addonKey: 'example',
      configuration: {},
      capabilities: [],
      retrySafe: false,
      deliveryMode: 'Event',
    },
  };
}

describe('hook recipient selection', () => {
  it('captures applied versions, scalar filters, enablement and deterministic order', async () => {
    const { select, store, bindings } = fixture();
    const binding = addon();

    bindings.push(binding);
    store.subscriptions.set('addon', {
      ...subscription,
      subscriptionId: 'addon',
      ownerKind: 'Addon',
      addonKey: 'example',
      priority: 2,
      configuration: { frozen: true },
    });
    const recipients = await select.select('site', ['cms.page.created'], { type: 'selected' });

    expect(recipients.map((item) => item.subscriptionId)).toEqual(['addon', 'user']);
    expect(recipients[0]).toMatchObject({ configuration: { frozen: true }, priority: 2 });
    expect(recipients[1]).toMatchObject({ versionId: 'applied', capabilities: ['cms.page.update'] });
    expect(await select.select('site', ['cms.page.created'], { type: 'other' })).toHaveLength(1);
    store.handlers.set('handler', { ...handler, enabled: false });
    expect(await select.select('site', ['cms.page.created'], { type: 'selected' })).toHaveLength(1);
    expect(await select.select('foreign-site', ['cms.page.created'], { type: 'selected' })).toEqual([]);
  });
  it('fails for missing applied code and enforces 128 recipients per hook rather than per capture', async () => {
    const { select, store } = fixture();

    store.versions.clear();
    await expect(select.select('site', ['cms.page.created'], { type: 'selected' }))
      .rejects.toMatchObject({ code: 'HookUnavailable' });
    store.versions.set(version.versionId, version);

    for (let i = 0; i < 128; i++) {
      store.subscriptions.set('binding-' + i, { ...subscription, subscriptionId: 'binding-' + i });
    }
    await expect(select.select('site', ['cms.page.created'], { type: 'selected' }))
      .rejects.toMatchObject({ code: 'Validation' });
    store.subscriptions.delete('user');
    expect(await select.select('site', ['cms.page.created'], { type: 'selected' })).toHaveLength(128);
  });
  it('preserves add-on enable/disable capture and installation scope', async () => {
    const { select, bindings, source } = fixture();

    vi.mocked(source.addonEnabled).mockResolvedValue(false);
    bindings.push(addon('cms.addon.enabled'), addon('cms.addon.disabled'),
      addon('cms.installation.setup.completed', HookScopeKind.Installation));
    expect(await select.select('site', ['cms.addon.enabled'], { addonKey: 'example' }))
      .toEqual([bindings[0]!.recipient]);
    expect(await select.select('site', ['cms.addon.enabled'], { addonKey: 'other' })).toEqual([]);
    expect(await select.select('site', ['cms.addon.disabled'], { addonKey: 'example' })).toEqual([]);
    expect(await select.select(null, ['cms.installation.setup.completed'], {}))
      .toEqual([bindings[2]!.recipient]);
    expect(await select.select('site', ['cms.installation.setup.completed'], {})).toEqual([]);
  });
});
