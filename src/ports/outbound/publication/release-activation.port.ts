import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IActivePublication } from '../../../domain/publication/publication-release.js';

export interface IActivateReleaseInput {
  readonly hookChange?: IHookCommitIntent;
  readonly siteId: string;
  readonly releaseId: string;
  readonly expectedActiveReleaseId: string | null;
  readonly activatedAt: Date;
}

export interface IReleaseActivationPort {
  getActive(siteId: string): Promise<IActivePublication | null>;
  /** Reject non-ready/foreign releases; compare and atomically switch one authoritative pointer. */
  activate(input: IActivateReleaseInput): Promise<IActivePublication>;
  /** Acknowledged activation, even when another release is now active. */
  findActivation(siteId: string, releaseId: string): Promise<IActivePublication | null>;
}
