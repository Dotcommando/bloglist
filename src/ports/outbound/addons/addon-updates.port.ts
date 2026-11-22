import type { IAddonUpdateProposal, IAddonUpdateState } from '../../../domain/addons/addon-update.js';

export interface IAddonUpdatesPort {
  begin(updateId: string, actorId: string): Promise<IAddonUpdateState>;
  pause(proposal: IAddonUpdateProposal): Promise<void>;
  migrate(proposal: IAddonUpdateProposal): Promise<void>;
  activate(proposal: IAddonUpdateProposal): Promise<void>;
  restart(proposal: IAddonUpdateProposal): Promise<number>;
  complete(proposal: IAddonUpdateProposal, forcedProcessCount: number): Promise<IAddonUpdateState>;
  fail(proposal: IAddonUpdateProposal): Promise<void>;
  reserve(): Promise<() => Promise<void>>;
}
