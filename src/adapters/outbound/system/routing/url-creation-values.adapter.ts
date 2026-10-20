import { randomUUID } from 'node:crypto';

import type { IUrlCreationValues } from '../../../../ports/outbound/routing/url-creation-values.port.js';

export class UrlCreationValuesAdapter implements IUrlCreationValues {
  nextUrlId(): string {
    return randomUUID();
  }

  currentInstant(): Date {
    return new Date();
  }
}
