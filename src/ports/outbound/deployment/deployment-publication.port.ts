import type { IDeploymentPublication } from '../../../domain/deployment/deployment.js';

export interface IDeploymentPublicationPort {
  current(siteId: string): Promise<IDeploymentPublication | null>;
}
