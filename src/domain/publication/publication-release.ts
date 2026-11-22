import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { SnapshotEntity } from '../shared/snapshot-entity.js';
import {
  requireAssetPath, requireCondition, requireInstant, requireInteger, requireText,
} from '../shared/validation.js';
import type { IArtifactMetadata } from './publication-artifact.js';
import { type IPublishedPageSummary, validatePublishedPages } from './published-page-summary.js';
import type { PublishedRoute } from './published-route.js';
import { PublishedRouteKind } from './published-route.js';

export enum ReleaseState {
  Staged = 'Staged',
  Ready = 'Ready',
  Failed = 'Failed',
}

export interface IPublicationManifest {
  readonly publishedPages?: readonly IPublishedPageSummary[];
  readonly routes: readonly PublishedRoute[];
  readonly artifacts: readonly IArtifactMetadata[];
}

export interface IPublicationReleaseState {
  readonly releaseId: string;
  readonly siteId: string;
  readonly siteKey?: string;
  readonly state: ReleaseState;
  readonly manifest: IPublicationManifest | null;
  readonly failure: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface IActivePublication {
  readonly siteId: string;
  readonly releaseId: string;
  readonly activatedAt: Date;
}

export class PublicationRelease extends SnapshotEntity<IPublicationReleaseState> {
  constructor(state: IPublicationReleaseState) {
    for (const value of [state.releaseId, state.siteId]) {
      requireText(value, 'Release identity');
    }
    requireInstant(state.createdAt, 'createdAt');

    if (state.siteKey !== undefined) {
      requireCondition(/^[A-Za-z][A-Za-z0-9_-]*$/.test(state.siteKey), 'Invalid site source key');
    }
    requireCondition(Object.values(ReleaseState).includes(state.state), 'Invalid release state');

    if (state.completedAt !== null) {
      requireInstant(state.completedAt, 'completedAt');
      requireCondition(state.completedAt >= state.createdAt, 'Release completion predates creation');
    }
    if (state.state === ReleaseState.Ready) {
      requireCondition(state.manifest !== null && state.completedAt !== null && state.failure === null,
        'Ready release requires completed artifacts');

      if (state.manifest) {
        PublicationRelease.validateManifest(state.manifest);
        validatePublishedPages(state.siteId, state.manifest.publishedPages ?? []);
        requireCondition((state.manifest.publishedPages ?? []).every((page) => state.manifest!.routes.some((route) =>
          route.kind !== PublishedRouteKind.Redirect && route.urlId === page.urlId
          && route.pageId === page.pageId && route.path === page.path)), 'Catalog address is not published');
      }
    } else if (state.state === ReleaseState.Failed) {
      requireCondition(Boolean(state.failure?.trim()) && state.completedAt !== null && state.manifest === null,
        'Failed release requires a diagnostic, not public artifacts');
    } else {
      requireCondition(state.manifest === null && state.completedAt === null && state.failure === null,
        'Staged release cannot contain completed output');
    }
    super(state);
  }

  complete(manifest: IPublicationManifest, at: Date): void {
    const state = this.requireStaged();
    const next = new PublicationRelease({ ...state, manifest, state: ReleaseState.Ready, completedAt: at });

    this.replaceState(next.toState());
  }

  fail(diagnostic: string, at: Date): void {
    const state = this.requireStaged();
    const next = new PublicationRelease({ ...state, state: ReleaseState.Failed, failure: diagnostic, completedAt: at });

    this.replaceState(next.toState());
  }

  private requireStaged(): IPublicationReleaseState {
    const state = this.toState();

    if (state.state !== ReleaseState.Staged) {
      throw new BusinessError(BusinessErrorCode.InvalidTransition, 'Release has already completed');
    }

    return state;
  }

  private static validateManifest(manifest: IPublicationManifest): void {
    const artifacts = new Map(manifest.artifacts.map((artifact) => [artifact.path, artifact]));
    const routes = new Map(manifest.routes.map((route) => [route.urlId, route]));

    requireCondition(artifacts.size === manifest.artifacts.length, 'Duplicate artifact path');
    requireCondition(routes.size === manifest.routes.length, 'Duplicate URL identity');
    requireCondition(new Set(manifest.routes.map((route) => route.path)).size === manifest.routes.length,
      'Duplicate public route path');

    for (const artifact of manifest.artifacts) {
      requireAssetPath(artifact.path);
      requireCondition(artifact.public || (artifact.path !== 'public' && !artifact.path.startsWith('public/')),
        'Private artifacts cannot occupy the public web root');
      requireText(artifact.mimeType, 'artifact mimeType');
      requireText(artifact.checksum, 'artifact checksum');
      requireInteger(artifact.byteSize, 0, 'artifact byte size');
    }

    for (const route of manifest.routes) {
      requireText(route.urlId, 'urlId');
      requireCondition(route.path.startsWith('/') && !route.path.startsWith('//')
        && !/[?#\\]/.test(route.path), 'Invalid public route path');
      requireCondition(Object.values(PublishedRouteKind).includes(route.kind), 'Invalid route kind');

      if (route.kind === PublishedRouteKind.Static) {
        requireText(route.pageId, 'pageId');
        const document = artifacts.get(route.documentPath);

        requireCondition(document?.public === true && Boolean(document.mimeType),
          'Static route requires an existing public document');

        if (route.markdownPath !== undefined) {
          const markdown = artifacts.get(route.markdownPath);

          requireCondition(document?.mimeType === 'text/html' && markdown?.public === true
            && markdown.mimeType === 'text/markdown', 'Invalid Markdown representation');
        }
      } else if (route.kind === PublishedRouteKind.Request) {
        requireText(route.pageId, 'pageId');
        requireText(route.renderPlanId, 'renderPlanId');
        const plan = artifacts.get(`plans/${route.renderPlanId}.json`);

        requireCondition(plan?.public === false && plan.mimeType === 'application/json',
          'Request route requires a private compiled plan');
      } else {
        requireCondition(route.status === 301 || route.status === 308, 'Invalid redirect status');

        if (route.targetPath !== undefined) {
          requireCondition(route.targetPath.startsWith('/') && !route.targetPath.startsWith('//')
            && !/[?#\\\s]/.test(route.targetPath), 'Invalid retained redirect destination path');
        }

        const visited = new Set<string>([route.urlId]);
        let targetId = route.targetUrlId;

        while (true) {
          requireCondition(!visited.has(targetId), 'Redirect cycle');
          const target = routes.get(targetId);

          if (!target) {
            if (route.targetPath !== undefined) {
              break;
            }
            throw new BusinessError(BusinessErrorCode.Validation, 'Redirect target is missing');
          }
          if (target.kind !== PublishedRouteKind.Redirect) {
            break;
          }
          visited.add(targetId);
          targetId = target.targetUrlId;
        }
      }
    }
  }
}
