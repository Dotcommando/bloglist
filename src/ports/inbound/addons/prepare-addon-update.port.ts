import type { IAddonUpdateProposal } from '../../../domain/addons/addon-update.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IPrepareAddonUpdate {
  execute(input: { readonly actorId: string; readonly content: IBinaryContent }): Promise<IAddonUpdateProposal>;
}
