export enum DeploymentState {
  Idle = 'Idle',
  Queued = 'Queued',
  Running = 'Running',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
  OutcomeUnknown = 'OutcomeUnknown',
}

export enum DeploymentIssue {
  Configuration = 'Configuration',
  NoPublication = 'NoPublication',
  Backend = 'Backend',
  Storage = 'Storage',
  Authorization = 'Authorization',
  DomainConflict = 'DomainConflict',
  ProviderUnavailable = 'ProviderUnavailable',
  PublicationChanged = 'PublicationChanged',
  Interrupted = 'Interrupted',
}

export enum DeploymentStage {
  Upload = 'Upload',
  ProviderVerification = 'ProviderVerification',
  DomainVerification = 'DomainVerification',
  PublicVerification = 'PublicVerification',
}

export enum DeploymentReason {
  UnconfirmedOutcome = 'UnconfirmedOutcome',
  HttpStatus = 'HttpStatus',
  ReceiptMismatch = 'ReceiptMismatch',
  ActiveVersionMismatch = 'ActiveVersionMismatch',
  DomainMismatch = 'DomainMismatch',
  Network = 'Network',
  Authorization = 'Authorization',
}

export enum DeploymentRecovery {
  Reconcile = 'Reconcile',
  CheckProviderAndReconcile = 'CheckProviderAndReconcile',
  CheckDomainAndReconcile = 'CheckDomainAndReconcile',
  CheckBackendAndReconcile = 'CheckBackendAndReconcile',
  CheckCredentialsAndReconcile = 'CheckCredentialsAndReconcile',
}

export interface IDeploymentDiagnostic {
  readonly issue: DeploymentIssue;
  readonly retryable: boolean;
  readonly stage?: DeploymentStage;
  readonly reason?: DeploymentReason;
  readonly httpStatus?: number;
  readonly recovery?: DeploymentRecovery;
}

export interface IDeploymentTarget {
  readonly targetId: string;
  readonly siteId: string;
  readonly version: string;
  readonly providerKey: string;
  readonly destinationName: string;
  readonly publicOrigin: string;
  readonly backendOrigin: string;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IDeploymentPublication {
  readonly releaseId: string;
  readonly generation: string;
}

export interface IDeploymentAttempt {
  readonly attemptId: string;
  readonly target: IDeploymentTarget;
  readonly publication: IDeploymentPublication;
  readonly startedAt: Date;
  readonly ownershipUntil: Date;
}

export interface IDeploymentRecord {
  readonly siteId: string;
  readonly version: string;
  readonly target: IDeploymentTarget;
  readonly state: DeploymentState;
  readonly attempt: IDeploymentAttempt | null;
  readonly requested: IDeploymentPublication | null;
  readonly attempts: number;
  readonly retryAt: Date | null;
  readonly diagnostic: IDeploymentDiagnostic | null;
  readonly delivered: {
    readonly releaseId: string;
    readonly generation: string;
    readonly targetVersion: string;
    readonly providerVersion: string;
    readonly completedAt: Date;
  } | null;
}

export interface IDeploymentStatus {
  readonly target: IDeploymentTarget | null;
  readonly version: string | null;
  readonly activeReleaseId: string | null;
  readonly state: DeploymentState;
  readonly attempts: number;
  readonly retryAt: Date | null;
  readonly diagnostic: IDeploymentDiagnostic | null;
  readonly delivered: IDeploymentRecord['delivered'];
}

export enum DeploymentOutcomeKind {
  Confirmed = 'Confirmed',
  Rejected = 'Rejected',
  Unknown = 'Unknown',
}

export type DeploymentOutcome = {
  readonly kind: DeploymentOutcomeKind.Confirmed;
  readonly releaseId: string;
  readonly providerVersion: string;
} | {
  readonly kind: DeploymentOutcomeKind.Rejected;
  readonly diagnostic: IDeploymentDiagnostic;
} | {
  readonly kind: DeploymentOutcomeKind.Unknown;
  readonly diagnostic?: IDeploymentDiagnostic;
};
