import type { ISiteDeployment } from '../../../domain/publication/site-deployment.js';

export interface ISiteDeploymentOutputResult {
  readonly directory: string;
  readonly files: number;
  readonly originFiles?: readonly string[];
  readonly exportId?: string;
}

export interface ISiteDeploymentOutputPort {
  /** Prepare a complete public tree; a failed preparation preserves the last successful output. */
  write(deployment: ISiteDeployment): Promise<ISiteDeploymentOutputResult>;
}
