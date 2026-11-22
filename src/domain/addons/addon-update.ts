export enum AddonUpdateMode {
  Compatible = 'Compatible',
  Exclusive = 'Exclusive',
}

export enum AddonUpdatePhase {
  Prepared = 'Prepared',
  Quiescing = 'Quiescing',
  Migrating = 'Migrating',
  Activating = 'Activating',
  Completed = 'Completed',
  Failed = 'Failed',
}

export interface IAddonUpdateProposal {
  readonly updateId: string;
  readonly addonKey: string;
  readonly fromDigest: string;
  readonly toDigest: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly mode: AddonUpdateMode;
}

export interface IAddonUpdateState extends IAddonUpdateProposal {
  readonly phase: AddonUpdatePhase;
  readonly paused: boolean;
  readonly forcedProcessCount: number;
  readonly updatedAt: Date;
}
