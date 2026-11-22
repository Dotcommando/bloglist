import type { IHookHandler } from '../../../domain/hooks/hook.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IHookConfigurationStore } from '../../../ports/outbound/hooks/hook-configuration.port.js';

export async function checkedHookHandler(store: IHookConfigurationStore, siteId: string, handlerId: string,
  expectedVersion: string): Promise<IHookHandler> {
  const handler = await store.handler(siteId, handlerId);

  if (handler?.siteId !== siteId) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Handler not found');
  }
  if (handler.version !== expectedVersion) {
    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Handler changed');
  }

  return handler;
}
