import type { Page } from '../../../domain/pages/page.js';
import type {
  IAssignPageToCluster,
  IAssignPageToClusterInput,
} from '../../../ports/inbound/pages/assign-page-to-cluster.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { PageRelationshipsService } from '../../services/pages/page-relationships.service.js';
import type { PageScopeService } from '../../services/pages/page-scope.service.js';

export class AssignPageToClusterUseCase implements IAssignPageToCluster {
  constructor(
    private readonly pages: IPageRepository,
    private readonly scope: PageScopeService,
    private readonly relationships: PageRelationshipsService,
  ) {}

  async execute(input: IAssignPageToClusterInput): Promise<Page> {
    const page = await this.scope.requirePage(input.siteId, input.pageId);

    page.assignToCluster(input.clusterId);

    if (page.clusterId !== null) {
      await this.relationships.validate(page.siteId, page.language, page.clusterId);
    }

    return this.pages.save(page);
  }
}
