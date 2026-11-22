import { HookAddonRecipientsAdapter } from '../../src/adapters/outbound/runtime/hooks/hook-addon-recipients.adapter.js';
import { HookAddonRegistry } from '../../src/adapters/outbound/runtime/hooks/hook-addon-registry.js';
import { HookKind, HookScopeKind } from '../../src/domain/hooks/hook.js';

describe('code-owned hook recipient descriptors', () => {
  it('translates stable identities without filtering by scope, enablement or known definitions', async () => {
    const registry = new HookAddonRegistry();

    vi.spyOn(registry, 'bindings').mockReturnValue([
      {
        addonKey: 'synthetic',
        digest: 'package-version',
        handler: {
          key: 'enabled',
          title: 'Enabled',
          hookKey: 'cms.addon.enabled',
          kind: HookKind.Event,
          priority: 3,
          retrySafe: true,
          source: 'return {};',
          capabilities: ['cms.page.update'],
        },
      },
      {
        addonKey: 'synthetic',
        digest: 'package-version',
        handler: {
          key: 'installation',
          title: 'Installation',
          hookKey: 'cms.installation.setup.completed',
          kind: HookKind.Event,
          priority: 0,
          retrySafe: false,
          source: 'return {};',
          capabilities: [],
        },
      },
      {
        addonKey: 'synthetic',
        digest: 'package-version',
        handler: {
          key: 'unknown',
          title: 'Unknown',
          hookKey: 'missing.definition',
          kind: HookKind.Event,
          priority: 0,
          retrySafe: false,
          source: 'return {};',
          capabilities: [],
        },
      },
    ]);
    const source = new HookAddonRecipientsAdapter(registry);
    const bindings = await source.read('site-a');
    const other = await source.read('site-b');
    const installation = await source.read(null);

    expect(bindings).toHaveLength(3);
    expect(bindings[0]!.recipient).toMatchObject({
      versionId: 'synthetic:package-version:enabled',
      priority: 3,
      capabilities: ['cms.page.update'],
      deliveryMode: 'Event',
      addonKey: 'synthetic',
    });
    expect(bindings[1]!.definition?.scopeKind).toBe(HookScopeKind.Installation);
    expect(bindings[2]!.definition).toBeNull();
    expect(bindings[0]!.recipient.subscriptionId).not.toBe(other[0]!.recipient.subscriptionId);
    expect(bindings[0]!.recipient.subscriptionId).not.toBe(installation[0]!.recipient.subscriptionId);
    expect(bindings[0]!.recipient.consumerId).toBe(other[0]!.recipient.consumerId);
    expect(await source.read('site-a')).toEqual(bindings);
  });
});
