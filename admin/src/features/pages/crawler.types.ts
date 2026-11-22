export enum SystemDocument { Sitemap = 'Sitemap', Robots = 'Robots', Llms = 'Llms' }

export enum SitemapReason {
  Unpublished = 'Unpublished',
  SystemDocument = 'SystemDocument',
  Noindex = 'Noindex',
  Explicit = 'Explicit',
  Robots = 'Robots',
  NoOrigin = 'NoOrigin',
}

export interface ICrawlerDiagnostic {
  pageId: string;
  path: string;
  inSitemap: boolean;
  reason: SitemapReason | null;
  robotsAvailable: boolean;
  blockedBy: { agent: string; rule: string; line: number }[];
}
