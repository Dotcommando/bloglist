import type { ClientSession } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import type { MongooseHookEvents } from './hook-events.adapter.js';

export async function recordHookChange(events: MongooseHookEvents | undefined, intent: IHookCommitIntent | undefined,
  session: ClientSession): Promise<void> {
  if (!intent || intent.facts.length === 0 && !intent.commandReceipt) {
    return;
  }
  if (!events) {
    throw new Error('Hook-aware persistence is not configured');
  }
  await events.record(intent, session);
}

export async function persistHookChange<T>(events: MongooseHookEvents | undefined, intent: IHookCommitIntent
  | undefined,
mutate: (session?: ClientSession) => Promise<T>, registryChanged = false, requiresTransaction = false,
writeConflictRetries?: number): Promise<T> {
  if (!requiresTransaction && (!intent || intent.facts.length === 0 && !intent.commandReceipt)) {
    return mutate();
  }
  if (!events) {
    throw new Error('Hook-aware persistence is not configured');
  }

  return events.persistence.transaction(async (session) => {
    const result = await mutate(session);

    await recordHookChange(events, intent, session);

    if (registryChanged && intent) {
      await events.persistence.bump(intent.siteId, session);
    }

    return result;
  }, writeConflictRetries);
}
