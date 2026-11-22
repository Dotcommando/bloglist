export const DOCUMENT_MIME_TYPES: readonly string[] = Object.freeze([
  'text/html',
  'text/plain',
  'text/markdown',
  'application/xml',
  'application/json',
  'application/rss+xml',
  'application/atom+xml',
  'text/css',
  'text/javascript',
  'image/svg+xml',
]);

export function documentMimeType(value: string | undefined): string {
  const mime = value === undefined ? 'text/html' : value;

  if (
    typeof mime !== 'string'
    || mime.length > 255
    || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(mime)
  ) {
    throw new RangeError('Expected a MIME type/subtype without parameters');
  }

  return mime.toLowerCase();
}

export enum SystemDocument {
  Sitemap = 'Sitemap',
  Robots = 'Robots',
  Llms = 'Llms',
}

export function systemDocumentPath(role: SystemDocument): string {
  return role === SystemDocument.Sitemap ? '/sitemap.xml'
    : role === SystemDocument.Robots ? '/robots.txt' : '/llms.txt';
}

export function isSystemDocumentPath(path: string): boolean {
  return Object.values(SystemDocument).some((role) => systemDocumentPath(role) === path);
}

export function systemDocumentMime(role: SystemDocument): string {
  return role === SystemDocument.Sitemap ? 'application/xml' : 'text/plain';
}

export function systemDocumentMark(role: SystemDocument): string {
  return role === SystemDocument.Sitemap ? 'sitemapXml'
    : role === SystemDocument.Robots ? 'robotsTxt' : 'llmsTxt';
}
