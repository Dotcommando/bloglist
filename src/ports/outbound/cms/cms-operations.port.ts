import type { ICmsCoreOperations } from '../../inbound/cms/cms-api.port.js';

export interface ICmsContext {
  readonly readOnly?: boolean;
  readonly siteId: string;
  readonly actorId: string;
}

export interface ICmsOperationsPort {
  forContext(context: ICmsContext): ICmsCoreOperations;
}
