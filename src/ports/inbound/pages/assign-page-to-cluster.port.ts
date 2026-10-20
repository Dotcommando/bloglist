import type { Page } from '../../../domain/pages/page.js';

export interface IAssignPageToClusterInput {
  pageId: string;
  clusterId: string | null;
}

export interface IAssignPageToCluster {
  execute(input: IAssignPageToClusterInput): Promise<Page>;
}
