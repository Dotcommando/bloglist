import type { IAddonUpdateProposal, IAddonUpdateState } from '../../../domain/addons/addon-update.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IAddonUpdatePackagesPort {
  prepareContent(content: IBinaryContent): Promise<IAddonUpdateProposal>;
  status(updateId: string): Promise<IAddonUpdateState | IAddonUpdateProposal>;
}
