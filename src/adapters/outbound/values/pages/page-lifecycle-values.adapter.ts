import { randomUUID } from 'node:crypto';

import type { IPageLifecycleValues } from '../../../../ports/outbound/pages/page-lifecycle-values.port.js';

export class PageLifecycleValuesAdapter implements IPageLifecycleValues {
  nextPageId(): string {
    return randomUUID();
  }

  currentInstant(): Date {
    return new Date();
  }
}
