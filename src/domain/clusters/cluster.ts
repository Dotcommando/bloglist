import { ClusterStatus } from './cluster-status.enum.js';

export interface IClusterState {
  readonly clusterId: string;
  readonly mark: string;
  readonly siteId: string;
  readonly parentClusterId: string | null;
  readonly language: string;
  readonly name: string;
  readonly descriptionMd: string | null;
  readonly industry: string | null;
  readonly geography: string | null;
  readonly primaryQuery: string | null;
  readonly status: ClusterStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Cluster {
  #state: IClusterState;

  constructor(state: IClusterState) {
    const normalized = {
      ...state,
      name: state.name.trim(),
      language: state.language.trim().toLowerCase(),
    };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get clusterId(): string {
    return this.#state.clusterId;
  }

  get mark(): string {
    return this.#state.mark;
  }

  get siteId(): string {
    return this.#state.siteId;
  }

  get parentClusterId(): string | null {
    return this.#state.parentClusterId;
  }

  get language(): string {
    return this.#state.language;
  }

  get name(): string {
    return this.#state.name;
  }

  get descriptionMd(): string | null {
    return this.#state.descriptionMd;
  }

  get industry(): string | null {
    return this.#state.industry;
  }

  get geography(): string | null {
    return this.#state.geography;
  }

  get primaryQuery(): string | null {
    return this.#state.primaryQuery;
  }

  get status(): ClusterStatus {
    return this.#state.status;
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): IClusterState {
    return structuredClone(this.#state);
  }

  rename(name: string): void {
    this.change({ name: name.trim() });
  }

  changeDescription(descriptionMd: string | null): void {
    this.change({ descriptionMd });
  }

  changeIndustry(industry: string | null): void {
    this.change({ industry: industry?.trim() ?? null });
  }

  changeGeography(geography: string | null): void {
    this.change({ geography: geography?.trim() ?? null });
  }

  changePrimaryQuery(primaryQuery: string | null): void {
    this.change({ primaryQuery: primaryQuery?.trim() ?? null });
  }

  moveTo(parentClusterId: string | null): void {
    this.change({ parentClusterId });
  }

  activate(): void {
    this.change({ status: ClusterStatus.ACTIVE });
  }

  archive(): void {
    this.change({ status: ClusterStatus.ARCHIVED });
  }

  private change(changes: Partial<IClusterState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IClusterState): void {
    if (!/^[a-z]{2}$/.test(state.language)) {
      throw new RangeError('Invalid cluster language');
    }
    if (state.parentClusterId === state.clusterId) {
      throw new RangeError('Cluster cannot be its own parent');
    }
    if (state.parentClusterId !== null && !state.parentClusterId.trim()) {
      throw new RangeError('Parent cluster identity is required');
    }
    if (!state.clusterId.trim()) {
      throw new RangeError('clusterId is required');
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(state.mark)) {
      throw new RangeError('Invalid immutable mark');
    }
    if (!state.siteId.trim()) {
      throw new RangeError('siteId is required');
    }
    if (!state.name.trim()) {
      throw new RangeError('name is required');
    }
    if (!Object.values(ClusterStatus).includes(state.status)) {
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
