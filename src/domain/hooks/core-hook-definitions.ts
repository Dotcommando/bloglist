import { HookKind, HookScopeKind, type IHookDefinition } from './hook.js';

const siteEvents = [
  'site.setup.completed', 'site.settings.changed', 'site.archived',
  'page.created', 'page.draft.updated', 'page.moved', 'page.rendering.configured', 'page.archived',
  'page.version.restored', 'page.version.published', 'release.activated',
  'url.created', 'url.path.changed', 'url.parent.changed', 'url.page-binding.changed', 'url.deleted',
  'redirect.created', 'redirect.target.changed', 'redirect.status.changed', 'redirect.deleted', 'routing.changed',
  'element.created', 'element.updated',
  'addon.enabled', 'addon.configuration.changed', 'addon.disabled',
  'content.imported', 'site.restored',
];

const checks = [
  'site.setup.complete', 'site.update', 'site.archive', 'page.create', 'page.update', 'page.move',
  'page.configure-rendering', 'page.archive', 'page.restore-version', 'page.publish-version', 'release.activate',
  'routing.change', 'element.create', 'element.update',
  'addon.enable', 'addon.configure', 'content.import', 'site.restore',
];

export const coreHookDefinitions: readonly IHookDefinition[] = [
  ...siteEvents.map((name) => ({
    hookKey: 'cms.' + name,
    title: name,
    description: 'Confirmed ' + name,
    provider: 'cms',
    kind: HookKind.Event,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Site,
  })),
  ...checks.map((name) => ({
    hookKey: 'cms.' + name + '.check',
    title: name + '.check',
    description: 'Before ' + name,
    provider: 'cms',
    kind: HookKind.Check,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Site,
  })),
  ...['site.created', 'installation.setup.completed'].map((name) => ({
    hookKey: 'cms.' + name,
    title: name,
    description: 'Confirmed ' + name,
    provider: 'cms',
    kind: HookKind.Event,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Installation,
  })),
  ...['site.create', 'installation.setup.complete'].map((name) => ({
    hookKey: 'cms.' + name + '.check',
    title: name + '.check',
    description: 'Before ' + name,
    provider: 'cms',
    kind: HookKind.Check,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Installation,
  })),
];
