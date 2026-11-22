import type { IPublicationReleaseState } from '../../../domain/publication/publication-release.js';
import type { IBuiltPublication, IFrontendBuildInput } from './frontend-build.port.js';

export interface IPageReleaseBuildInput extends IFrontendBuildInput {
  readonly pageId: string;
  readonly previous: IPublicationReleaseState | null;
}

export interface IPageReleaseBuildPort {
  /** Build this page and retain other routes and immutable outputs from the selected release. */
  buildPage(input: IPageReleaseBuildInput): Promise<IBuiltPublication>;
}
