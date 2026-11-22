import type {
  IDeploymentDiagnostic,
  IDeploymentStatus,
  IDeploymentTarget,
} from '../../../domain/deployment/deployment.js';

export interface IDeploymentActor {
  readonly siteId: string;
  readonly actorId: string;
}

export interface IGetDeploymentStatus {
  execute(input: IDeploymentActor): Promise<IDeploymentStatus>;
}

export interface IConfigureDeploymentInput extends IDeploymentActor {
  readonly expectedVersion: string | null;
  readonly enabled: boolean;
  readonly providerKey: string;
  readonly destinationName: string;
  readonly publicOrigin: string;
  readonly backendOrigin: string;
}

export interface IConfigureDeploymentTarget {
  execute(input: IConfigureDeploymentInput): Promise<IDeploymentTarget>;
}

export interface IRetryDeployment {
  execute(input: IDeploymentActor & { readonly expectedVersion: string }): Promise<IDeploymentStatus>;
}

export interface ICheckDeploymentTarget {
  execute(input: IDeploymentActor): Promise<readonly IDeploymentDiagnostic[]>;
}

export interface IProcessDeploymentTargets {
  execute(): Promise<{ readonly processed: number }>;
}
