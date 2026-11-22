const namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export interface ISitemapLocation {
  location: string;
  href: string;
}

export function sitemapLocations(xml: string): readonly ISitemapLocation[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('Unsupported sitemap declaration');
  }

  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;

  if (
    document.getElementsByTagNameNS('*', 'parsererror').length
    || root.localName !== 'urlset'
    || root.namespaceURI !== namespace
  ) {
    throw new Error('Invalid sitemap XML');
  }

  return Array.from(root.children).map((entry) => {
    const locations = Array.from(entry.children).filter((child) => child.localName === 'loc'
      && child.namespaceURI === namespace);

    if (entry.localName !== 'url' || entry.namespaceURI !== namespace || locations.length !== 1) {
      throw new Error('Invalid sitemap entry');
    }

    const location = locations[0]!.textContent ?? '';
    const url = new URL(location);

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Invalid sitemap URL');
    }

    return { location, href: url.href };
  });
}
