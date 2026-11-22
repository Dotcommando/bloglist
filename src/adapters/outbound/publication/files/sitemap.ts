import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom';

import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { siteAddresses } from '../../../../domain/sites/site-addresses.js';
import { artifact } from '../../rendering/vite/artifacts.js';

const namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export function sitemapArtifact(origin: string | undefined, paths: readonly string[],
  stylesheetHref?: string): IPublicationArtifact {
  if (origin) {
    siteAddresses({ publicOrigin: origin, localOrigin: null });
  }
  requireCondition(Boolean(origin) || paths.length === 0, 'Sitemap addresses require an origin');
  const unique = [...new Set(paths)].sort();

  requireCondition(unique.length <= 50000, 'Sitemap exceeds 50000 addresses');
  const document = new DOMImplementation().createDocument(namespace, 'urlset', null);

  for (const path of unique) {
    const url = new URL(path, origin);

    requireCondition(url.origin === origin && !url.search && !url.hash, 'Invalid sitemap address');
    const entry = document.createElementNS(namespace, 'url');
    const location = document.createElementNS(namespace, 'loc');

    location.appendChild(document.createTextNode(url.href));
    entry.appendChild(location);
    document.documentElement!.appendChild(entry);
  }

  if (stylesheetHref) {
    requireCondition(/^\/assets\/(?:releases\/[A-Za-z0-9_%~-]+\/)?styles\/sitemap\.[a-f0-9]{20}\.css$/
      .test(stylesheetHref), 'Invalid sitemap stylesheet');
    document.insertBefore(document.createProcessingInstruction('xml-stylesheet',
      'type="text/css" href="' + stylesheetHref + '"'), document.documentElement);
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(document);

  requireCondition(Buffer.byteLength(xml) <= 50 * 1024 * 1024, 'Sitemap exceeds 50 MiB');

  return artifact('sitemap.xml', 'application/xml', xml);
}

export function sitemapPaths(xml: string): string[] {
  requireCondition(Buffer.byteLength(xml) <= 50 * 1024 * 1024 && !/<!DOCTYPE|<!ENTITY/i.test(xml), 'Invalid sitemap');
  const document = new DOMParser({
    onError: () => {
      throw new Error('Invalid sitemap XML');
    },
  })
    .parseFromString(xml, 'application/xml');

  requireCondition(document.documentElement?.localName === 'urlset'
    && document.documentElement.namespaceURI === namespace, 'Invalid sitemap root');

  return Array.from(document.getElementsByTagNameNS(namespace, 'loc')).map((element) => {
    const url = new URL(element.textContent ?? '');

    requireCondition(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && !url.search && !url.hash, 'Invalid sitemap location');

    return decodeURI(url.pathname);
  });
}
