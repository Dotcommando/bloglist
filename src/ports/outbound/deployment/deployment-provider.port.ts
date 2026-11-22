import type {
  DeploymentOutcome,
  IDeploymentAttempt,
  IDeploymentDiagnostic,
  IDeploymentTarget,
} from '../../../domain/deployment/deployment.js';

export interface IDeploymentProviderPort {
  readonly key: string;
  check(target: IDeploymentTarget): Promise<readonly IDeploymentDiagnostic[]>;
  deliver(attempt: IDeploymentAttempt): Promise<DeploymentOutcome>;
  reconcile(attempt: IDeploymentAttempt): Promise<DeploymentOutcome>;
}

export interface IDeploymentProviderCataloguePort {
  supports(providerKey: string): boolean;
  validate(target: IDeploymentTarget): void;
}

export interface IDeploymentProviderResolverPort {
  resolve(providerKey: string): IDeploymentProviderPort | null;
}
