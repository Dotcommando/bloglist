import type { IAddonObject } from '@zarya/addon-contracts/addons';
import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import type { ICmsApi } from '@zarya/addon-contracts/cms';

import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { CmsApi } from '../../../ports/inbound/cms/cms-api.port.js';
import {
  CmsExtensionOperationKind,
  type CmsExtensions,
  type ICmsAddonExtension,
  type ICmsExtensionAccessPort,
} from '../../../ports/outbound/cms/cms-extension.port.js';
import type { ICmsContext } from '../../../ports/outbound/cms/cms-operations.port.js';

export class CmsExtensionRegistryService {
  private readonly extensions = new Map<string, ICmsAddonExtension>();

  constructor(private readonly access: ICmsExtensionAccessPort) {}

  register(addonKey: string, extension: ICmsAddonExtension): void {
    const validKey = (key: string): boolean => /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(key)
      && !['constructor', 'prototype', '__proto__'].includes(key);

    if (
      !validKey(addonKey)
      || this.extensions.has(addonKey)
      || extension.version !== 1
      || !extension.objects
      || typeof extension.objects !== 'object'
    ) {
      throw new Error('Invalid or duplicate CMS extension');
    }

    const objects = Object.fromEntries(Object.entries(extension.objects).map(([key, methods]) => {
      if (!validKey(key) || !methods || typeof methods !== 'object') {
        throw new Error('Invalid CMS extension object');
      }

      return [key, Object.freeze(Object.fromEntries(Object.entries(methods).map(([method, operation]) => {
        if (
          !validKey(method)
          || !Object.values(CmsExtensionOperationKind).includes(operation.kind)
          || !Object.values(AddonOperationAccess).includes(operation.access)
          || typeof operation.execute !== 'function'
        ) {
          throw new Error('Invalid CMS extension operation');
        }

        return [method, Object.freeze({
          kind: operation.kind,
          access: operation.access,
          execute: operation.execute.bind(operation),
        })];
      })))];
    }));

    this.extensions.set(addonKey, Object.freeze({ version: 1, objects: Object.freeze(objects) }));
  }

  unregister(addonKey: string): void {
    this.extensions.delete(addonKey);
  }

  forContext(context: ICmsContext, cms: CmsApi & ICmsApi, before?: () => Promise<void>): CmsExtensions {
    return Object.freeze(Object.fromEntries([...this.extensions].map(([addonKey, extension]) => [
      addonKey, Object.freeze(Object.fromEntries(Object.entries(extension.objects).map(([objectKey, methods]) => [
        objectKey, Object.freeze(Object.fromEntries(Object.keys(methods).map((method) => [
          method, async (input: IAddonObject = {}) => {
            const operation = this.extensions.get(addonKey)?.objects[objectKey]?.[method];

            if (!operation) {
              throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'CMS extension is unavailable');
            }
            if (context.readOnly && operation.kind !== CmsExtensionOperationKind.Query) {
              throw new BusinessError(BusinessErrorCode.Forbidden,
                'Commands are unavailable in parallel Snippet reads');
            }
            if (
              Object.keys(input).some((key) =>
                ['siteId', 'actorId', '__proto__', 'constructor', 'prototype'].includes(key))
            ) {
              throw new BusinessError(BusinessErrorCode.Validation, 'Extension identity is host-owned');
            }
            await before?.();
            await this.access.authorize(context.siteId, addonKey, operation.access);

            return structuredClone(await operation.execute(structuredClone(input), { ...context, cms }));
          },
        ]))),
      ]))),
    ])));
  }
}
