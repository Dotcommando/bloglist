import {
  DeploymentIssue,
  type IDeploymentDiagnostic,
  type IDeploymentPublication,
  type IDeploymentTarget,
} from '../../../domain/deployment/deployment.js';
import type { IDeploymentInspectionPort } from '../../../ports/outbound/deployment/deployment-inspection.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';

export class DeploymentInspectionAdapter implements IDeploymentInspectionPort {
  constructor(private readonly store: IPublicationStorePort, private readonly request: typeof fetch = fetch) {}

  async inspect(target: IDeploymentTarget,
    publication: IDeploymentPublication): Promise<readonly IDeploymentDiagnostic[]> {
    try {
      const release = await this.store.read(target.siteId, publication.releaseId);

      if (release?.siteId !== target.siteId || release.releaseId !== publication.releaseId) {
        throw new Error('Publication storage unavailable');
      }
    } catch {
      return [{ issue: DeploymentIssue.Storage, retryable: false }];
    }

    try {
      const response = await this.request(new URL('/api/health', target.backendOrigin), {
        method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
      });

      await response.body?.cancel();

      if (response.status !== 200) {
        throw new Error('Backend unavailable');
      }
    } catch {
      return [{ issue: DeploymentIssue.Backend, retryable: true }];
    }

    return [];
  }
}
