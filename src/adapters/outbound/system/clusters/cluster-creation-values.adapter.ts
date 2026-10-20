import { randomUUID } from 'node:crypto';

import type { IClusterCreationValues } from '../../../../ports/outbound/clusters/cluster-creation-values.port.js';

export class ClusterCreationValuesAdapter implements IClusterCreationValues {
  nextClusterId(): string {
    return randomUUID();
  }

  currentInstant(): Date {
    return new Date();
  }
}
