import type { Connection } from 'mongoose';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IHookGenerationPort } from '../../../../../ports/outbound/hooks/hook-generation.port.js';
import type { IHookScopeRecord } from './hook.persistence.js';

export class MongooseHookGenerationAdapter implements IHookGenerationPort {
  constructor(private readonly connection: Connection) {}

  async currentGeneration(siteId: string): Promise<string | null> {
    if (!this.connection.db) {
      throw new Error('Hook database is not open');
    }

    const scope = await this.connection.db.collection<IHookScopeRecord>('hook_scope_states').findOne({
      _id: 'site:' + siteId,
      scopeKind: 'Site',
      siteId,
    }, { readConcern: { level: 'majority' } });

    if (scope && scope.mode !== 'Active') {
      throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Site generation is not available');
    }

    return scope?.generation ?? null;
  }
}
