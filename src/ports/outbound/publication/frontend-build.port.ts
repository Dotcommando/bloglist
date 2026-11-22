import type { IPublicationArtifact } from '../../../domain/publication/publication-artifact.js';
import type { IPublicationManifest } from '../../../domain/publication/publication-release.js';
import type { IPublicationSnapshot, IRenderedDocument, IRenderPlan } from '../../../domain/publication/render-plan.js';

export interface IFrontendBuildInput {
  readonly releaseId: string;
  readonly assetBasePath?: string;
  readonly snapshot: IPublicationSnapshot;
  readonly documents: readonly IRenderedDocument[];
  readonly requestPlans: readonly IRenderPlan[];
}

export interface IBuiltPublication {
  readonly artifacts: readonly IPublicationArtifact[];
  readonly manifest: IPublicationManifest;
}

export interface IFrontendBuildPort {
  build(input: IFrontendBuildInput): Promise<IBuiltPublication>;
}
