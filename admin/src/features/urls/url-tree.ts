import type { IUrlCatalog, IUrlNode } from './urls.types.js';

export function urlParent(path: string): string | null {
  if (path === '/') {
    return null;
  }

  const end = path.endsWith('/') ? path.length - 1 : path.length;
  const index = path.lastIndexOf('/', end - 1);

  return path.slice(0, index + 1) || '/';
}

export function urlTree(catalog: IUrlCatalog): IUrlNode[] {
  const nodes = new Map<string, IUrlNode>();
  const ensure = (path: string): IUrlNode => {
    const found = nodes.get(path);

    if (found) {
      return found;
    }

    const parent = urlParent(path);
    const node = { path, parent, row: null, live: null, inSitemap: false };

    nodes.set(path, node);

    if (parent !== null) {
      ensure(parent);
    }

    return node;
  };

  ensure('/');

  for (const row of catalog.urls) {
    ensure(row.url.path).row = row;
  }

  for (const route of catalog.published?.routes ?? []) {
    ensure(route.path).live = route;
  }

  for (const path of catalog.published?.sitemapPaths ?? []) {
    ensure(path).inSitemap = true;
  }

  return [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function siteLink(origin: string | null, path: string): string | null {
  if (!origin || !path.startsWith('/') || path.startsWith('//')) {
    return null;
  }

  const result = new URL(path, origin);

  return result.origin === origin && !result.search && !result.hash ? result.href : null;
}
