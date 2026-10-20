import { randomUUID } from 'node:crypto';

import type {
  IClusterBlogCreationValues,
} from '../../../../ports/outbound/clusters/cluster-blog-creation-values.port.js';

export class ClusterBlogCreationValuesAdapter implements IClusterBlogCreationValues {
  nextPlacementId(): string {
    return randomUUID();
  }

  currentInstant(): Date {
    return new Date();
  }
}
