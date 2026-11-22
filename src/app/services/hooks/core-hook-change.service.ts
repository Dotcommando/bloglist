import type { IAddonObject } from '@zarya/addon-contracts/addons';

import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';

export function prepareCoreHook(hooks: IHookChangesPort, siteId: string | null, subject: string,
  action: string, payload: IAddonObject, event: string, actorId = 'system'): Promise<IHookCommitIntent> {
  return hooks.prepare({
    siteId,
    actorId,
    subject,
    checkKey: action,
    candidate: payload,
    facts: [{ hookKey: event, payload }],
  });
}
