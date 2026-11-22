import type { IJsonLdPublicationContext } from '../../../domain/json-ld/json-ld-publication.js';
import type { IPublicationArtifact } from '../../../domain/publication/publication-artifact.js';
import type { PublishedRoute } from '../../../domain/publication/published-route.js';

export interface IJsonLdReleaseProjectionPort {
  refresh(input: { readonly siteId: string;
    readonly context?: IJsonLdPublicationContext;
    readonly origin?: string;
    readonly routes: readonly PublishedRoute[];
    readonly artifacts: readonly IPublicationArtifact[] }): Promise<IPublicationArtifact[]>;
}
