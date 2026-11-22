import { validateTemplateValues } from '../template-variables/template-variable.js';
import { documentMimeType, SystemDocument, systemDocumentMime } from './document-mime.js';
import { OpenGraphType } from './open-graph-type.enum.js';
import type { IPageRendering } from './page-rendering.js';
import type { ITemplateObject } from './page-rendering.js';
import { validatePageRendering } from './page-rendering.policy.js';
import { PageStatus } from './page-status.enum.js';
import { isPageNumber, validateSortOrder } from './page-tree.policy.js';
import { PageType } from './page-type.enum.js';

export interface IPageState {
  readonly mimeType?: string;
  readonly excludeFromSitemap?: boolean;
  readonly systemDocument?: SystemDocument | null;
  readonly tvValues?: ITemplateObject;
  /** Original page-owned TV choices; published TV values may include frozen shared defaults. */
  readonly authoredTvValues?: ITemplateObject;
  readonly pageNumber?: string | null;
  readonly parentPageId?: string | null;
  readonly sortOrder?: number | null;
  readonly pageId: string;
  readonly mark: string;
  readonly siteId: string;
  readonly clusterId: string | null;
  readonly language: string;
  readonly type: PageType;
  readonly status: PageStatus;
  readonly title: string;
  readonly h1: string | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  // Legacy retained snapshots omit OG fields; construction normalizes them to null.
  readonly ogTitle?: string | null;
  readonly ogDescription?: string | null;
  readonly ogImage?: string | null;
  readonly ogType?: OpenGraphType | null;
  readonly contentMd: string;
  readonly robotsIndex: boolean;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly rendering?: IPageRendering;
}

export interface IPageSeoMetadata {
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
}

export class Page {
  #state: IPageState;

  constructor(state: IPageState) {
    const normalized = {
      ...state,
      mimeType: documentMimeType(state.mimeType),
      excludeFromSitemap: state.excludeFromSitemap ?? false,
      systemDocument: state.systemDocument ?? null,
      pageNumber: state.pageNumber ?? null,
      parentPageId: state.parentPageId ?? null,
      sortOrder: state.sortOrder === undefined ? 100 : state.sortOrder,
      title: state.title.trim(),
      language: state.language.trim().toLowerCase(),
      ogTitle: state.ogTitle ?? null,
      ogDescription: state.ogDescription ?? null,
      ogImage: state.ogImage ?? null,
      ogType: state.ogType ?? null,
    };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get mimeType(): string {
    return this.#state.mimeType ?? 'text/html';
  }

  get systemDocument(): SystemDocument | null {
    return this.#state.systemDocument ?? null;
  }

  changeDocument(mimeType: string, excludeFromSitemap: boolean): void {
    this.change({ mimeType: documentMimeType(mimeType), excludeFromSitemap });
  }

  get pageId(): string {
    return this.#state.pageId;
  }

  get pageNumber(): string | null {
    return this.#state.pageNumber ?? null;
  }

  get parentPageId(): string | null {
    return this.#state.parentPageId ?? null;
  }

  get sortOrder(): number | null {
    return this.#state.sortOrder ?? null;
  }

  changeSortOrder(sortOrder: number): void {
    this.change({ sortOrder });
  }

  get mark(): string {
    return this.#state.mark;
  }

  get siteId(): string {
    return this.#state.siteId;
  }

  get clusterId(): string | null {
    return this.#state.clusterId;
  }

  get language(): string {
    return this.#state.language;
  }

  get type(): PageType {
    return this.#state.type;
  }

  get status(): PageStatus {
    return this.#state.status;
  }

  get title(): string {
    return this.#state.title;
  }

  get h1(): string | null {
    return this.#state.h1;
  }

  get metaTitle(): string | null {
    return this.#state.metaTitle;
  }

  get metaDescription(): string | null {
    return this.#state.metaDescription;
  }

  get contentMd(): string {
    return this.#state.contentMd;
  }

  get robotsIndex(): boolean {
    return this.#state.robotsIndex;
  }

  get publishedAt(): Date | null {
    return structuredClone(this.#state.publishedAt);
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): IPageState {
    return structuredClone(this.#state);
  }

  configureRendering(rendering: IPageRendering): void {
    if (this.mimeType !== 'text/html') {
      throw new RangeError('Text documents do not use HTML rendering');
    }
    this.change({ rendering });
  }

  changeTitle(title: string): void {
    this.change({ title: title.trim() });
  }

  changeHeading(h1: string | null): void {
    this.change({ h1 });
  }

  changeSeoMetadata(metadata: IPageSeoMetadata): void {
    this.change({ metaTitle: metadata.metaTitle, metaDescription: metadata.metaDescription });
  }

  changeContent(contentMd: string): void {
    this.change({ contentMd });
  }

  changeOpenGraph(metadata: Pick<IPageState, 'ogTitle' | 'ogDescription' | 'ogImage' | 'ogType'>): void {
    this.change(metadata);
  }

  changeType(type: PageType): void {
    this.change({ type });
  }

  assignToCluster(clusterId: string | null): void {
    this.change({ clusterId });
  }

  setRobotsIndex(robotsIndex: boolean): void {
    this.change({ robotsIndex });
  }

  publish(publishedAt: Date): void {
    if (!Number.isFinite(publishedAt.getTime())) {
      throw new RangeError('Invalid publication instant');
    }
    this.change({ status: PageStatus.PUBLISHED, publishedAt: this.#state.publishedAt ?? publishedAt });
  }

  archive(): void {
    if (this.systemDocument) {
      throw new RangeError('System documents cannot be archived');
    }
    this.change({ status: PageStatus.ARCHIVED });
  }

  editDraft(): void {
    if (this.#state.status === PageStatus.PUBLISHED) {
      this.change({ status: PageStatus.DRAFT });
    }
  }

  restorePublishedContent(version: IPageState): void {
    if (this.systemDocument === SystemDocument.Sitemap) {
      throw new RangeError('sitemap.xml is generated and read-only');
    }

    const saved = new Page(version).toState();

    if (
      saved.pageId !== this.pageId
      || saved.siteId !== this.siteId
      || saved.mark !== this.mark
      || saved.language !== this.language
      || saved.status !== PageStatus.PUBLISHED
    ) {
      throw new RangeError('A retained publication of this page is required');
    }

    const next = {
      ...this.#state,
      title: saved.title,
      h1: saved.h1,
      metaTitle: saved.metaTitle,
      metaDescription: saved.metaDescription,
      ogTitle: saved.ogTitle ?? null,
      ogDescription: saved.ogDescription ?? null,
      ogImage: saved.ogImage ?? null,
      ogType: saved.ogType ?? null,
      contentMd: saved.contentMd,
      mimeType: saved.mimeType ?? 'text/html',
      excludeFromSitemap: saved.excludeFromSitemap ?? false,
      tvValues: saved.tvValues ?? {},
      type: saved.type,
      robotsIndex: saved.robotsIndex,
      status: PageStatus.DRAFT,
    };

    if (saved.rendering === undefined) {
      delete next.rendering;
    } else {
      next.rendering = saved.rendering;
    }
    this.validate(next);
    this.#state = structuredClone(next);
  }

  private change(changes: Partial<IPageState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IPageState): void {
    documentMimeType(state.mimeType);

    if (typeof state.excludeFromSitemap !== 'boolean') {
      throw new RangeError('excludeFromSitemap must be a boolean');
    }
    if (
      state.systemDocument != null
      && (!Object.values(SystemDocument).includes(state.systemDocument)
      || state.parentPageId !== null
      || state.mimeType !== systemDocumentMime(state.systemDocument))
    ) {
      throw new RangeError('Invalid protected system document');
    }
    if (state.authoredTvValues !== undefined) {
      validateTemplateValues(state.authoredTvValues);
    }
    if (state.tvValues !== undefined) {
      validateTemplateValues(state.tvValues);
    }
    if (state.pageNumber != null && !isPageNumber(state.pageNumber)) {
      throw new RangeError('Invalid numeric page identity');
    }
    if (state.sortOrder != null) {
      validateSortOrder(state.sortOrder);
    }
    if (state.parentPageId != null && (!state.parentPageId.trim() || state.parentPageId === state.pageId)) {
      throw new RangeError('Invalid parent page');
    }

    for (const value of [state.h1, state.metaTitle, state.metaDescription,
      state.ogTitle, state.ogDescription, state.ogImage]) {
      if (value !== null && value !== undefined && typeof value !== 'string') {
        throw new RangeError('Page metadata must be a string or null');
      }
    }

    if (typeof state.robotsIndex !== 'boolean') {
      throw new RangeError('robotsIndex must be a boolean');
    }
    if (state.ogType != null && !Object.values(OpenGraphType).includes(state.ogType)) {
      throw new RangeError('Invalid Open Graph type');
    }
    if (state.ogImage) {
      let url: URL;

      try {
        url = new URL(state.ogImage);
      } catch {
        throw new RangeError('Open Graph image must be an absolute HTTP(S) URL');
      }

      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new RangeError('Open Graph image must be a public HTTP(S) URL');
      }
    }
    if (state.rendering) {
      validatePageRendering(state.rendering);
    }
    if (!/^[a-z]{2}$/.test(state.language)) {
      throw new RangeError('Invalid page language');
    }
    if (state.clusterId !== null && !state.clusterId.trim()) {
      throw new RangeError('Cluster identity is required');
    }
    if (typeof state.contentMd !== 'string') {
      throw new RangeError('Page content must be a string');
    }
    if (state.status === PageStatus.PUBLISHED && state.publishedAt === null) {
      throw new RangeError('Published page requires a publication instant');
    }
    if (!state.pageId.trim()) {
      throw new RangeError('pageId is required');
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(state.mark)) {
      throw new RangeError('Invalid immutable mark');
    }
    if (!state.siteId.trim()) {
      throw new RangeError('siteId is required');
    }
    if (!Object.values(PageType).includes(state.type)) {
      throw new RangeError('Invalid type');
    }
    if (!Object.values(PageStatus).includes(state.status)) {
      throw new RangeError('Invalid status');
    }
    if (!state.title.trim()) {
      throw new RangeError('title is required');
    }
    if (state.publishedAt !== null && !Number.isFinite(state.publishedAt.getTime())) {
      throw new RangeError('Invalid publishedAt instant');
    }
    if (!Number.isFinite(state.createdAt.getTime())) {
      throw new RangeError('Invalid createdAt instant');
    }
    if (!Number.isFinite(state.updatedAt.getTime())) {
      throw new RangeError('Invalid updatedAt instant');
    }
  }
}
