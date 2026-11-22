import type { IPageState } from './page.js';

export type IComparablePage = Partial<Pick<IPageState, 'title' | 'contentMd' | 'mimeType' | 'h1' | 'metaTitle'
  | 'metaDescription' | 'ogTitle' | 'ogDescription' | 'ogImage' | 'robotsIndex' | 'excludeFromSitemap'
  | 'parentPageId' | 'sortOrder' | 'mark' | 'language'>> & {
    readonly ogType?: string | null;
    readonly rendering?: {
      readonly templateId?: string;
      readonly delivery?: string;
      readonly interaction?: string;
      readonly parameters?: unknown;
      readonly loaders?: unknown;
      readonly requestCache?: unknown;
    };
    readonly authoredTvValues?: Readonly<Record<string, unknown>>;
    readonly tvValues?: Readonly<Record<string, unknown>>;
  };

/** Only page-owned editable values participate; timestamps and publication history do not. */
export function pageEditableFields(page: IComparablePage): Readonly<Record<string, unknown>> {
  return {
    title: page.title,
    contentMd: page.contentMd,
    mimeType: page.mimeType ?? 'text/html',
    h1: page.h1 ?? null,
    metaTitle: page.metaTitle ?? null,
    metaDescription: page.metaDescription ?? null,
    ogTitle: page.ogTitle ?? null,
    ogDescription: page.ogDescription ?? null,
    ogImage: page.ogImage ?? null,
    ogType: page.ogType ?? null,
    robotsIndex: page.robotsIndex ?? true,
    excludeFromSitemap: page.excludeFromSitemap ?? false,
    parentPageId: page.parentPageId ?? null,
    sortOrder: page.sortOrder ?? null,
    mark: page.mark,
    language: page.language,
    'rendering.templateId': page.rendering?.templateId ?? null,
    'rendering.delivery': page.rendering?.delivery ?? null,
    'rendering.interaction': page.rendering?.interaction ?? null,
    'rendering.parameters': page.rendering?.parameters ?? {},
    'rendering.loaders': page.rendering?.loaders ?? [],
    'rendering.requestCache': page.rendering?.requestCache ?? null,
    ...Object.fromEntries(Object.entries(page.authoredTvValues ?? page.tvValues ?? {})
      .map(([key, value]) => ['tvValues.' + key, value])),
  };
}

export function editableValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value: unknown, index: number) => editableValuesEqual(value, right[index]));
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }

  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) => {
    const entry = rightEntries.find(([other]) => other === key);

    return entry !== undefined && editableValuesEqual(value, entry[1]);
  });
}

export function changedPageFields(draft: IComparablePage, published: IComparablePage): readonly string[] {
  const left = pageEditableFields(draft);
  const right = pageEditableFields(published);

  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !editableValuesEqual(left[key], right[key]));
}
