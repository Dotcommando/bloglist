export enum InstallationProcessRole {
  Coordinator = 'Coordinator',
  Administration = 'Administration',
  Site = 'Site',
  Dump = 'Dump',
}

export enum InstallationProcessState {
  Starting = 'Starting',
  Ready = 'Ready',
  Draining = 'Draining',
}

export interface IInstallationProcess {
  readonly pid: number | null;
  readonly role: InstallationProcessRole;
  readonly siteId: string | null;
  readonly state: InstallationProcessState;
}
