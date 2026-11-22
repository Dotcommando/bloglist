import type { IContentReference } from '../../../domain/shared/binary-content.js';

export interface IAssetDeliveryPort {
  /** Only owned, public derivatives; stable URLs must not expire inside static pages. */
  publicUrl(siteId: string, reference: IContentReference): Promise<string>;
}
