import type { IAdminPage } from '../../shared/api/content.types';

export interface IPageTreeRow {
  readonly page: IAdminPage;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly position: number;
  readonly siblings: number;
}

export function comparePages(left: IAdminPage, right: IAdminPage): number {
  const order = left.sortOrder - right.sortOrder;

  if (order) {
    return order;
  }
  if (left.pageNumber && right.pageNumber) {
    const a = BigInt(left.pageNumber);
    const b = BigInt(right.pageNumber);

    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }

  return left.pageId < right.pageId ? -1 : left.pageId > right.pageId ? 1 : 0;
}

export function canMovePage(pages: readonly IAdminPage[], pageId: string, parentPageId: string | null): boolean {
  const source = pages.find((page) => page.pageId === pageId);

  if (!source || source.systemDocument || source.parentPageId === parentPageId) {
    return false;
  }

  const visited = new Set<string>([pageId]);
  let current = parentPageId;

  while (current !== null) {
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);
    const page = pages.find((page) => page.pageId === current && page.siteId === source.siteId);

    if (!page || page.systemDocument) {
      return false;
    }
    current = page.parentPageId;
  }

  return true;
}

export function visiblePageTree(pages: readonly IAdminPage[], expanded: ReadonlySet<string>): IPageTreeRow[] {
  const rows: IPageTreeRow[] = [];
  const visit = (parent: string | null, depth: number): void => {
    const siblings = pages.filter((page) => page.parentPageId === parent).toSorted(comparePages);

    for (const [index, page] of siblings.entries()) {
      const hasChildren = pages.some((candidate) => candidate.parentPageId === page.pageId);

      rows.push({ page, depth, hasChildren, position: index + 1, siblings: siblings.length });

      if (hasChildren && expanded.has(page.pageId) && depth < pages.length) {
        visit(page.pageId, depth + 1);
      }
    }
  };

  visit(null, 0);

  return rows;
}
