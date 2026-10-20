import { PageStatus } from './page-status.enum.js';
import { PageType } from './page-type.enum.js';

export interface IPageState {
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
  readonly contentMd: string;
  readonly robotsIndex: boolean;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
      title: state.title.trim(),
      language: state.language.trim().toLowerCase(),
    };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get pageId(): string {
    return this.#state.pageId;
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
    this.change({ status: PageStatus.ARCHIVED });
  }

  private change(changes: Partial<IPageState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IPageState): void {
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
