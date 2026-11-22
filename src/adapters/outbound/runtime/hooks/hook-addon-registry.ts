import {
  HookKind, HookScopeKind, type IAddonHookHandler,
  type IAddonHooksExtension,
} from '@zarya/addon-contracts/hooks';

import { type IHookDefinition, validateHookDraft } from '../../../../domain/hooks/hook.js';
import type { IHookRecipient } from '../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { HookCompilerAdapter } from './hook-script.adapter.js';

export function isAddonHooks(value: unknown): value is IAddonHooksExtension {
  if (
    !value
    || typeof value !== 'object'
    || !('version' in value)
    || value.version !== 1
    || !('definitions' in value)
    || !Array.isArray(value.definitions)
    || !('handlers' in value)
    || !Array.isArray(value.handlers)
  ) {
    return false;
  }

  const kind = (item: unknown): boolean => item === HookKind.Check || item === HookKind.Event;

  return value.definitions.every((item: unknown) => !!item && typeof item === 'object'
    && 'hookKey' in item && typeof item.hookKey === 'string' && 'provider' in item && typeof item.provider === 'string'
    && 'title' in item && typeof item.title === 'string' && 'description' in item && typeof
  item.description === 'string'
    && 'kind' in item && kind(item.kind) && 'schemaVersion' in item && item.schemaVersion === 1
    && 'scopeKind' in item && (item.scopeKind === HookScopeKind.Site || item.scopeKind === HookScopeKind.Installation))
    && value.handlers.every((item: unknown) => !!item && typeof item === 'object'
      && 'key' in item && typeof item.key === 'string' && 'title' in item && typeof item.title === 'string'
      && 'hookKey' in item && typeof item.hookKey === 'string' && 'kind' in item && kind(item.kind)
      && 'priority' in item && Number.isSafeInteger(item.priority) && 'retrySafe' in item && typeof
    item.retrySafe === 'boolean'
      && 'source' in item && typeof item.source === 'string' && 'capabilities' in item
        && Array.isArray(item.capabilities)
      && item.capabilities.every((capability: unknown) => typeof capability === 'string'));
}

interface IHookAddonEntry { readonly addonKey: string;
  readonly digest: string;
  readonly extension:
  IAddonHooksExtension; }

export class HookAddonRegistry {
  private readonly entries = new Map<string, IHookAddonEntry>();
  private readonly artifacts = new Map<string, { compiledJavaScript: string;
    digest: string;
    capabilities:
    readonly string[] }>();
  private changed: (() => Promise<void>) | null = null;

  onChange(callback: () => Promise<void>): void {
    this.changed = callback;
  }

  async register(addonKey: string, digest: string, extension: IAddonHooksExtension): Promise<void> {
    if (
      !isAddonHooks(extension)
      || extension.definitions.some((item) => item.provider !== addonKey
      || !item.hookKey.startsWith('addon.' + addonKey + '.'))
      || new Set(extension.handlers.map((handler) => handler.key)).size !== extension.handlers.length
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on hook extension');
    }

    for (const handler of extension.handlers) {
      validateHookDraft({ source: handler.source, capabilities: handler.capabilities }, handler.kind);
    }

    const entry = { addonKey, digest, extension };
    const compiled = await Promise.all(extension.handlers.map(async (handler) => ({
      key: addonKey + ':' + digest + ':' + handler.key,
      artifact: { ...await new HookCompilerAdapter().compile(handler.source), capabilities: handler.capabilities },
    })));
    const previous = this.entries.get(addonKey);

    this.entries.set(addonKey, entry);

    try {
      await this.changed?.();

      for (const item of compiled) {
        this.artifacts.set(item.key, item.artifact);
      }
    } catch (error) {
      if (previous) {
        this.entries.set(addonKey, previous);
      } else {
        this.entries.delete(addonKey);
      }
      throw error;
    }
  }

  definitions(): readonly IHookDefinition[] {
    return [...this.entries.values()].flatMap((entry) => entry.extension.definitions);
  }

  bindings(): readonly { addonKey: string; digest: string; handler: IAddonHookHandler }[] {
    return [...this.entries.values()].flatMap((entry) => entry.extension.handlers.map((handler) => ({
      addonKey: entry.addonKey, digest: entry.digest, handler,
    })));
  }

  artifact(recipient: IHookRecipient): { compiledJavaScript: string; digest: string; capabilities: readonly string[] } {
    const artifact = this.artifacts.get(recipient.versionId);

    if (!artifact) {
      throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Original add-on hook artifact is unavailable');
    }

    return artifact;
  }
}
