import { BlogPlatform } from './blog-platform.enum.js';
import { BlogStatus } from './blog-status.enum.js';

export interface IBlogState {
  readonly blogId: string;
  readonly mark: string;
  readonly bloggerId: string;
  readonly platform: BlogPlatform;
  readonly name: string;
  readonly url: string;
  readonly externalId: string | null;
  readonly handle: string | null;
  readonly followers: number | null;
  readonly description: string | null;
  readonly lastCheckedAt: Date | null;
  readonly status: BlogStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Blog {
  #state: IBlogState;

  constructor(state: IBlogState) {
    const normalized = {
      ...state,
      name: state.name.trim(),
      url: new URL(state.url).href,
      externalId: state.externalId?.trim() || null,
    };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get blogId(): string {
    return this.#state.blogId;
  }

  get mark(): string {
    return this.#state.mark;
  }

  get bloggerId(): string {
    return this.#state.bloggerId;
  }

  get platform(): BlogPlatform {
    return this.#state.platform;
  }

  get name(): string {
    return this.#state.name;
  }

  get url(): string {
    return this.#state.url;
  }

  get externalId(): string | null {
    return this.#state.externalId;
  }

  get handle(): string | null {
    return this.#state.handle;
  }

  get followers(): number | null {
    return this.#state.followers;
  }

  get description(): string | null {
    return this.#state.description;
  }

  get lastCheckedAt(): Date | null {
    return structuredClone(this.#state.lastCheckedAt);
  }

  get status(): BlogStatus {
    return this.#state.status;
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): IBlogState {
    return structuredClone(this.#state);
  }

  rename(name: string): void {
    this.change({ name: name.trim() });
  }

  changeUrl(url: string): void {
    this.change({ url: new URL(url).href });
  }

  changeHandle(handle: string | null): void {
    this.change({ handle: handle?.trim() ?? null });
  }

  changeDescription(description: string | null): void {
    this.change({ description });
  }

  reassignToBlogger(bloggerId: string): void {
    this.change({ bloggerId });
  }

  updateStats(followers: number, lastCheckedAt: Date): void {
    this.change({ followers, lastCheckedAt });
  }

  activate(): void {
    this.change({ status: BlogStatus.ACTIVE });
  }

  deactivate(): void {
    this.change({ status: BlogStatus.INACTIVE });
  }

  private change(changes: Partial<IBlogState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IBlogState): void {
    if (!['https:', 'http:'].includes(new URL(state.url).protocol)) {
      throw new RangeError('Blog URL must use HTTP or HTTPS');
    }
    if (state.followers !== null && (!Number.isFinite(state.followers) || state.followers < 0)) {
      throw new RangeError('Followers must be finite and nonnegative');
    }
    if (!state.blogId.trim()) {
      throw new RangeError('blogId is required');
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(state.mark)) {
      throw new RangeError('Invalid immutable mark');
    }
    if (!state.bloggerId.trim()) {
      throw new RangeError('bloggerId is required');
    }
    if (!Object.values(BlogPlatform).includes(state.platform)) {
      throw new RangeError('Invalid platform');
    }
    if (!state.name.trim()) {
      throw new RangeError('name is required');
    }
    if (state.lastCheckedAt !== null && !Number.isFinite(state.lastCheckedAt.getTime())) {
      throw new RangeError('Invalid lastCheckedAt instant');
    }
    if (!Object.values(BlogStatus).includes(state.status)) {
      throw new RangeError('Invalid status');
    }
    if (!Number.isFinite(state.createdAt.getTime())) {
      throw new RangeError('Invalid createdAt instant');
    }
    if (!Number.isFinite(state.updatedAt.getTime())) {
      throw new RangeError('Invalid updatedAt instant');
    }
  }
}
