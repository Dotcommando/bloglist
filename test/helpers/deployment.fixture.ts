import { DeploymentState, type IDeploymentRecord } from '../../src/domain/deployment/deployment.js';

export function deploymentFixture(siteId = 'site-a'): IDeploymentRecord {
  const at = new Date('2026-01-01T00:00:00.000Z');

  return {
    siteId,
    version: 'record-1',
    target: {
      siteId,
      targetId: 'target-' + siteId,
      version: 'target-1',
      providerKey: 'synthetic',
      destinationName: 'synthetic-site',
      publicOrigin: 'https://www.example.test',
      backendOrigin: 'https://api.example.test',
      enabled: true,
      createdAt: at,
      updatedAt: at,
    },
    state: DeploymentState.Idle,
    attempt: null,
    requested: null,
    attempts: 0,
    retryAt: null,
    diagnostic: null,
    delivered: null,
  };
}
