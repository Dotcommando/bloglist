import { type ITemplateObject, LoaderPhase } from '../pages/page-rendering.js';
import type { IPublishedPageSummary } from '../publication/published-page-summary.js';
import { type IParameterContract, ParameterKind } from '../publication/render-plan.js';
import { paginationItemContract, paginationLinkContract } from './pagination-contract.js';
import type { ISnippetSource } from './snippet.js';

const number = (name: string): IParameterContract => ({ name, kind: ParameterKind.Number, required: true });

const flag = (name: string): IParameterContract => ({ name, kind: ParameterKind.Boolean, required: true });

export interface IPaginationResult extends ITemplateObject {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasPages: boolean;
  readonly items: readonly { readonly pageId: string; readonly title: string; readonly path: string }[];
  readonly links: readonly { readonly page: number;
    readonly href: string;
    readonly current: boolean;
    readonly ariaCurrent: string }[];
}

export interface IPaginationContext {
  readonly siteId: string;
  readonly pageId: string;
  readonly language: string;
  readonly publishedPages?: readonly IPublishedPageSummary[];
}

export const paginationParameters: readonly IParameterContract[] = [
  { name: 'parentId', kind: ParameterKind.String, required: false },
  { name: 'page', kind: ParameterKind.String, required: false, defaultValue: '1' },
  { name: 'pageSize', kind: ParameterKind.Number, required: false, defaultValue: 10 },
];

export const paginationOutput: IParameterContract = {
  name: 'pagination',
  kind: ParameterKind.Object,
  required: true,
  properties: [number('page'), number('pageSize'), number('total'), number('totalPages'), flag('hasPages'),
    { name: 'items', kind: ParameterKind.Array, required: true, items: paginationItemContract },
    { name: 'links', kind: ParameterKind.Array, required: true, items: paginationLinkContract }],
};

export function paginate(input: ITemplateObject, context: IPaginationContext): IPaginationResult {
  const pageSize = input.pageSize ?? 10;
  const requested = input.page ?? '1';

  if (
    typeof pageSize !== 'number'
    || !Number.isSafeInteger(pageSize)
      || pageSize < 1
    || pageSize > 100
    || typeof requested !== 'string'
  ) {
    throw new Error('Invalid Pagination input');
  }

  const catalog = (context.publishedPages ?? []).filter((page) => page.siteId === context.siteId
      && page.language === context.language).toSorted((left, right) => left.path < right.path ? -1
    : left.path > right.path ? 1 : left.urlId < right.urlId ? -1 : 1);
  const parent = catalog.find((page) => page.pageId === (input.parentId ?? context.pageId));
  const seen = new Set<string>();
  const children = parent ? catalog.filter((page) => {
    if (page.parentUrlId !== parent.urlId || seen.has(page.pageId) || page.pageId === parent.pageId) {
      return false;
    }
    seen.add(page.pageId);

    return true;
  }) : [];
  const totalPages = Math.ceil(children.length / pageSize);
  const parsed = /^[1-9][0-9]*$/.test(requested) ? Number(requested) : 1;
  const page = Math.max(1, Math.min(parsed, totalPages || 1));
  const numbers = totalPages > 1 ? [...new Set([1, totalPages,
    ...Array.from({ length: 7 }, (_, index) => page - 3 + index)
      .filter((value) => value > 0 && value <= totalPages)])].sort((a, b) => a - b) : [];

  return {
    page,
    pageSize,
    total: children.length,
    totalPages,
    hasPages: totalPages > 1,
    items: children.slice((page - 1) * pageSize, page * pageSize)
      .map(({ pageId, title, path }) => ({ pageId, title, path })),
    links: numbers.map((value) => ({
      page: value,
      href: '?page=' + value,
      current: value === page,
      ariaCurrent: value === page ? 'page' : 'false',
    })),
  };
}

export const paginationSnippetSource: ISnippetSource = {
  code: 'return (' + paginate.toString() + ')(input, context);',
  output: paginationOutput,
  phases: [LoaderPhase.Build, LoaderPhase.Request],
};
