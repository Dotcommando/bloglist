import { randomUUID } from 'node:crypto';

import type { ISiteCreationValues } from '../../../../ports/outbound/sites/site-creation-values.port.js';

export class SiteCreationValuesAdapter implements ISiteCreationValues {
  nextSiteId(): string {
    return randomUUID();
  }

  currentInstant(): Date {
    return new Date();
  }
}
