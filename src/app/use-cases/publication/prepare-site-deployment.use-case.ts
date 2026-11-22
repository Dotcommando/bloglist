import { ReleaseState } from '../../../domain/publication/publication-release.js';
import type { ISiteDeploymentFile } from '../../../domain/publication/site-deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireAssetPath, requireCondition } from '../../../domain/shared/validation.js';
import { servingSiteOrigin } from '../../../domain/sites/site-addresses.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type {
  IPrepareSiteDeployment, IPrepareSiteDeploymentInput, IPrepareSiteDeploymentResult,
} from '../../../ports/inbound/publication/prepare-site-deployment.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { ISiteDeploymentOutputPort } from '../../../ports/outbound/publication/site-deployment-output.port.js';

export class PrepareSiteDeploymentUseCase implements IPrepareSiteDeployment {
  constructor(private readonly access: IPublicationAccessPort, private readonly sites: IGetSite,
    private readonly activation: Pick<IReleaseActivationPort, 'getActive'>,
    private readonly store: Pick<IPublicationStorePort, 'read'>,
    private readonly artifacts: IPublicationArtifactSourcePort,
    private readonly media: Pick<IFileLibraryOperations, 'list' | 'readContent'> | null,
    private readonly output: ISiteDeploymentOutputPort) {}

  async execute(input: IPrepareSiteDeploymentInput): Promise<IPrepareSiteDeploymentResult> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const site = await this.sites.execute({ siteId: input.siteId });

    if (!site) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
    requireCondition(site.siteId === input.siteId, 'Foreign deployment site');
    const active = await this.activation.getActive(input.siteId);

    if (!active) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Publish the site before preparing a deployment');
    }

    const release = await this.store.read(input.siteId, active.releaseId);

    requireCondition(active.siteId === input.siteId && release?.siteId === input.siteId
      && release.releaseId === active.releaseId && release.state === ReleaseState.Ready
      && release.manifest !== null, 'Missing or foreign active publication');
    const artifacts = await this.artifacts.readArtifacts(input.siteId, active.releaseId);
    const expected = release!.manifest!.artifacts.filter((file) => file.public);
    const publicFiles = artifacts.filter((file) => file.public);

    requireCondition(publicFiles.length === expected.length && expected.every((file) => publicFiles.some((item) =>
      file.path === item.path && file.byteSize === item.byteSize && file.mimeType === item.mimeType
      && file.checksum === item.checksum)), 'Deployment artifacts differ from the publication');
    const files: ISiteDeploymentFile[] = publicFiles.map((file) => ({
      path: file.path, content: file.content, checksum: file.checksum,
    }));

    if (this.media) {
      const library = await this.media.list.execute({ siteId: input.siteId });

      requireCondition(!library.pending, 'Media update is pending');

      for (const file of library.files) {
        for (const output of file.outputs) {
          requireCondition(output.key !== 'original' && output.url.startsWith('/')
            && !output.url.startsWith('//') && !/[?#]/.test(output.url), 'Invalid public media selection');
          const relative = decodeURIComponent(output.url.slice(1));

          requireAssetPath(relative);
          requireCondition(!relative.split('/').some((part) => part.startsWith('.'))
            && !/^(?:api|admin)(?:\/|$)/.test(relative), 'Private media cannot be deployed');
          const { content } = await this.media.readContent.execute({
            siteId: input.siteId, fileId: file.fileId, key: output.key,
          });

          files.push({ path: relative, content });
        }
      }
      const checked = await this.media.list.execute({ siteId: input.siteId });

      requireCondition(!checked.pending && checked.version === library.version,
        'Media changed while preparing the deployment; prepare again');
    }

    const result = await this.output.write({
      siteId: input.siteId,
      releaseId: active.releaseId,
      primaryDomain: site.primaryDomain,
      publicOrigin: servingSiteOrigin(site.toState().addresses),
      routes: release!.manifest!.routes,
      files,
    });

    return { siteId: input.siteId, releaseId: active.releaseId, ...result };
  }
}
