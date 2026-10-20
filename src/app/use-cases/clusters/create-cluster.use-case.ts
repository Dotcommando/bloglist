import { Cluster } from '../../../domain/clusters/cluster.js';
import { ClusterConflictError } from '../../../domain/clusters/cluster-conflict.error.js';
import { ClusterNotFoundError } from '../../../domain/clusters/cluster-not-found.error.js';
import { ClusterScopeError } from '../../../domain/clusters/cluster-scope.error.js';
import { ClusterStatus } from '../../../domain/clusters/cluster-status.enum.js';
import type { ICreateCluster, ICreateClusterInput } from '../../../ports/inbound/clusters/create-cluster.port.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';
import type { IClusterCreationValues } from '../../../ports/outbound/clusters/cluster-creation-values.port.js';
import type { ISiteLookupPort } from '../../../ports/outbound/clusters/site-lookup.port.js';

export class CreateClusterUseCase implements ICreateCluster {
  constructor(
    private readonly clusters: IClusterRepository,
    private readonly sites: ISiteLookupPort,
    private readonly creationValues: IClusterCreationValues,
  ) {}

  async execute(input: ICreateClusterInput): Promise<Cluster> {
    const at = this.creationValues.currentInstant();
    const cluster = new Cluster({
      clusterId: this.creationValues.nextClusterId(),
      mark: input.mark,
      siteId: input.siteId,
      language: input.language,
      name: input.name,
      parentClusterId: input.parentClusterId ?? null,
      descriptionMd: input.descriptionMd ?? null,
      industry: null,
      geography: null,
      primaryQuery: null,
      status: ClusterStatus.ACTIVE,
      createdAt: at,
      updatedAt: at,
    });

    if (input.industry !== undefined) {
      cluster.changeIndustry(input.industry);
    }
    if (input.geography !== undefined) {
      cluster.changeGeography(input.geography);
    }
    if (input.primaryQuery !== undefined) {
      cluster.changePrimaryQuery(input.primaryQuery);
    }

    const site = await this.sites.findSite(cluster.siteId);

    if (!site) {
      throw new ClusterNotFoundError('Site was not found');
    }
    if (site.siteId !== cluster.siteId) {
      throw new ClusterScopeError('Site lookup returned another site');
    }
    if (!site.languages.includes(cluster.language)) {
      throw new RangeError('Cluster language must be enabled for the site');
    }
    if (cluster.parentClusterId !== null) {
      const parent = await this.clusters.findById(cluster.parentClusterId);

      if (!parent) {
        throw new ClusterNotFoundError('Parent cluster was not found');
      }
      if (parent.siteId !== cluster.siteId) {
        throw new ClusterScopeError('Parent cluster belongs to another site');
      }
      if (parent.language !== cluster.language) {
        throw new RangeError('Parent and child clusters must use the same language');
      }
    }
    if (await this.clusters.findByMark(cluster.mark)) {
      throw new ClusterConflictError('Cluster mark is already in use');
    }

    return this.clusters.save(cluster);
  }
}
