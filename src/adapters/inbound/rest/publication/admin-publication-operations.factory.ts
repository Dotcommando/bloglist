import type { IActivePublication } from '../../../../domain/publication/publication-release.js';
import type { IGetPublicationOptions } from '../../../../ports/inbound/publication/get-publication-options.port.js';
import type { IPublishCurrentPageInput } from '../../../../ports/inbound/publication/publish-current-page.port.js';
import type { IPublishPageReleaseResult } from '../../../../ports/inbound/publication/publish-page-release.port.js';

export interface IAdminPublicationOperations {
  readonly getOptions: IGetPublicationOptions;
  readonly publishPage: {
    execute(input: Omit<IPublishCurrentPageInput, 'actorId'>): Promise<IPublishPageReleaseResult>;
  };
  readonly publishSite: { execute(siteId: string): Promise<IActivePublication> };
}

export interface IAdminPublicationOperationFactory {
  forSession(token: string | null): IAdminPublicationOperations;
}
