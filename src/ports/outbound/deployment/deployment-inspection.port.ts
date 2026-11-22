import type {
  IDeploymentDiagnostic,
  IDeploymentPublication,
  IDeploymentTarget,
} from '../../../domain/deployment/deployment.js';

export interface IDeploymentInspectionPort {
  inspect(target: IDeploymentTarget, publication: IDeploymentPublication): Promise<readonly IDeploymentDiagnostic[]>;
}
