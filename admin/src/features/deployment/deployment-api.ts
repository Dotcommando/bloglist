import { object, request, string } from '../../shared/api/content-api';

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
  issue: DeploymentIssue;
  retryable: boolean;
  stage?: DeploymentStage;
  reason?: DeploymentReason;
  httpStatus?: number;
  recovery?: DeploymentRecovery;
}

export interface IDeploymentConfiguration {
  expectedVersion: string | null;
  enabled: boolean;
  providerKey: string;
  destinationName: string;
  publicOrigin: string;
  backendOrigin: string;
}

export interface IDeploymentTarget extends Omit<IDeploymentConfiguration, 'expectedVersion'> { version: string; }

export interface IDeploymentStatus {
  target: IDeploymentTarget | null;
  version: string | null;
  activeReleaseId: string | null;
  state: DeploymentState;
  attempts: number;
  retryAt: string | null;
  diagnostic: IDeploymentDiagnostic | null;
  delivered: { releaseId: string; completedAt: string } | null;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}

function diagnostic(value: unknown): IDeploymentDiagnostic {
  const row = object(value);
  const issue = Object.values(DeploymentIssue).find((item) => item === row.issue);
  const stage = Object.values(DeploymentStage).find((item) => item === row.stage);
  const reason = Object.values(DeploymentReason).find((item) => item === row.reason);
  const recovery = Object.values(DeploymentRecovery).find((item) => item === row.recovery);

  if (
    !issue
    || typeof row.retryable !== 'boolean'
    || row.stage !== undefined
    && !stage
    || row.reason !== undefined
    && !reason
    || row.recovery !== undefined
    && !recovery
    || row.httpStatus !== undefined
    && (typeof row.httpStatus !== 'number'
      || !Number.isInteger(row.httpStatus)
    || row.httpStatus < 100
    || row.httpStatus > 599)
  ) {
    throw new Error('Invalid deployment diagnostic');
  }

  return {
    issue,
    retryable: row.retryable,
    ...(stage ? { stage } : {}),
    ...(reason ? { reason } : {}),
    ...(recovery ? { recovery } : {}),
    ...(typeof row.httpStatus === 'number' ? { httpStatus: row.httpStatus } : {}),
  };
}

export function readDeploymentStatus(value: unknown): IDeploymentStatus {
  const row = object(value);
  const state = Object.values(DeploymentState).find((item) => item === row.state);
  const target = row.target === null ? null : object(row.target);
  const delivered = row.delivered === null ? null : object(row.delivered);

  if (
    !state
    || typeof row.attempts !== 'number'
    || !Number.isSafeInteger(row.attempts)
    || row.attempts < 0
    || target
    && typeof target.enabled !== 'boolean'
  ) {
    throw new Error('Invalid deployment status');
  }

  return {
    target: target ? {
      version: string(target.version),
      enabled: target.enabled === true,
      providerKey: string(target.providerKey),
      destinationName: string(target.destinationName),
      publicOrigin: string(target.publicOrigin),
      backendOrigin: string(target.backendOrigin),
    } : null,
    version: nullableString(row.version),
    activeReleaseId: nullableString(row.activeReleaseId),
    state,
    attempts: row.attempts,
    retryAt: nullableString(row.retryAt),
    diagnostic: row.diagnostic === null ? null : diagnostic(row.diagnostic),
    delivered: delivered ? {
      releaseId: string(delivered.releaseId),
      completedAt: string(delivered.completedAt),
    } : null,
  };
}

export async function getDeploymentStatus(siteId: string): Promise<IDeploymentStatus> {
  return readDeploymentStatus(await request('/' + siteId + '/deployment'));
}

export async function saveDeployment(siteId: string, input: IDeploymentConfiguration): Promise<void> {
  await request('/' + siteId + '/deployment', input);
}

export async function retryDeployment(siteId: string, expectedVersion: string): Promise<IDeploymentStatus> {
  return readDeploymentStatus(await request('/' + siteId + '/deployment/retry', { expectedVersion }));
}

export async function checkDeployment(siteId: string): Promise<IDeploymentDiagnostic[]> {
  const row = object(await request('/' + siteId + '/deployment/check', {}, 60000));

  if (!Array.isArray(row.diagnostics)) {
    throw new Error('Invalid deployment diagnostics');
  }

  return row.diagnostics.map(diagnostic);
}
