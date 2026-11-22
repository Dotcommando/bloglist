import type { IPageState } from '../../../domain/pages/page.js';

export interface IRenderingRegistryPort {
  validate(page: IPageState): Promise<void>;
}
