import type { IBinaryContent } from '../shared/binary-content.js';
import type { PublishedRoute } from './published-route.js';

export interface ISiteDeploymentFile {
  readonly path: string;
  readonly content: IBinaryContent;
  readonly checksum?: string;
}

export interface ISiteDeployment {
  readonly siteId: string;
  readonly releaseId: string;
  readonly primaryDomain: string;
  readonly publicOrigin?: string | null;
  readonly routes: readonly PublishedRoute[];
  readonly files: readonly ISiteDeploymentFile[];
}
