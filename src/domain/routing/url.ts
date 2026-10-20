import { UrlKind } from './url-kind.enum.js';
import { UrlRedirectStatus } from './url-redirect-status.enum.js';

export interface IUrlState {
  readonly urlId: string;
  readonly mark: string;
  readonly siteId: string;
  readonly parentUrlId: string | null;
  readonly segment: string;
  readonly path: string;
  readonly kind: UrlKind;
  readonly pageId: string | null;
  readonly redirectTargetUrlId: string | null;
  readonly redirectStatus: UrlRedirectStatus | null;
  readonly firstPublishedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Url {
  #state: IUrlState;

  constructor(state: IUrlState) {
    const normalized = { ...state };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get urlId(): string {
    return this.#state.urlId;
  }

  get mark(): string {
    return this.#state.mark;
  }

  get siteId(): string {
    return this.#state.siteId;
  }

  get parentUrlId(): string | null {
    return this.#state.parentUrlId;
  }

  get segment(): string {
    return this.#state.segment;
  }

  get path(): string {
    return this.#state.path;
  }

  get kind(): UrlKind {
    return this.#state.kind;
  }

  get pageId(): string | null {
    return this.#state.pageId;
  }

  get redirectTargetUrlId(): string | null {
    return this.#state.redirectTargetUrlId;
  }

  get redirectStatus(): UrlRedirectStatus | null {
    return this.#state.redirectStatus;
  }

  get firstPublishedAt(): Date {
    return structuredClone(this.#state.firstPublishedAt);
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): IUrlState {
    return structuredClone(this.#state);
  }

  redirectTo(targetUrlId: string, status: UrlRedirectStatus): void {
    this.change({ kind: UrlKind.REDIRECT, pageId: null, redirectTargetUrlId: targetUrlId, redirectStatus: status });
  }

  private change(changes: Partial<IUrlState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IUrlState): void {
    if (state.parentUrlId === state.urlId) {
      throw new RangeError('URL cannot be its own parent');
    }
    if (state.redirectTargetUrlId === state.urlId) {
      throw new RangeError('URL cannot redirect to itself');
    }
    if (!state.path.startsWith('/') || state.path.startsWith('//') || /[?#\\]/.test(state.path)) {
      throw new RangeError('Expected a site-relative URL path');
    }
    if (state.parentUrlId !== null && !state.parentUrlId.trim()) {
      throw new RangeError('Parent URL identity is required');
    }
    if (state.kind === UrlKind.PAGE && (
      !state.pageId?.trim() || state.redirectTargetUrlId !== null || state.redirectStatus !== null
    )) {
      throw new RangeError('Invalid PAGE URL state');
    }
    if (state.kind === UrlKind.REDIRECT && (
      state.pageId !== null || !state.redirectTargetUrlId?.trim() || state.redirectStatus === null
    )) {
      throw new RangeError('Invalid REDIRECT URL state');
    }
    if (!state.urlId.trim()) {
      throw new RangeError('urlId is required');
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(state.mark)) {
      throw new RangeError('Invalid immutable mark');
    }
    if (!state.siteId.trim()) {
      throw new RangeError('siteId is required');
    }
    if (!state.segment.trim()) {
      throw new RangeError('segment is required');
    }
    if (!state.path.trim()) {
      throw new RangeError('path is required');
    }
    if (!Object.values(UrlKind).includes(state.kind)) {
      throw new RangeError('Invalid kind');
    }
    if (state.redirectStatus !== null && ![
      UrlRedirectStatus.HTTP_301,
      UrlRedirectStatus.HTTP_308,
    ].includes(state.redirectStatus)) {
      throw new RangeError('Invalid redirectStatus');
    }
    if (!Number.isFinite(state.firstPublishedAt.getTime())) {
      throw new RangeError('Invalid firstPublishedAt instant');
    }
    if (!Number.isFinite(state.createdAt.getTime())) {
      throw new RangeError('Invalid createdAt instant');
    }
    if (!Number.isFinite(state.updatedAt.getTime())) {
      throw new RangeError('Invalid updatedAt instant');
    }
  }
}
