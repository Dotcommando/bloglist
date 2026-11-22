import type { SystemDocument } from '../pages/document-mime.js';

export enum PublishedRouteKind {
  Static = 'Static',
  Request = 'Request',
  Redirect = 'Redirect',
}

export interface IPublishedRouteBase {
  readonly robotsIndex?: boolean;
  readonly excludeFromSitemap?: boolean;
  readonly systemDocument?: SystemDocument | null;
  readonly mimeType?: string;
  readonly urlId: string;
  readonly path: string;
}

export interface IStaticPublishedRoute extends IPublishedRouteBase {
  readonly kind: PublishedRouteKind.Static;
  readonly pageId: string;
  readonly documentPath: string;
  readonly markdownPath?: string;
}

export interface IRequestPublishedRoute extends IPublishedRouteBase {
  readonly kind: PublishedRouteKind.Request;
  readonly pageId: string;
  readonly renderPlanId: string;
}

export interface IRedirectPublishedRoute extends IPublishedRouteBase {
  readonly kind: PublishedRouteKind.Redirect;
  readonly targetUrlId: string;
  readonly targetPath?: string;
  readonly status: 301 | 308;
}

export type PublishedRoute = IStaticPublishedRoute | IRequestPublishedRoute | IRedirectPublishedRoute;
