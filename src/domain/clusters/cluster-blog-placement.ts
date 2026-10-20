export interface IClusterBlogPlacementState {
  readonly clusterBlogPlacementId: string;
  readonly clusterId: string;
  readonly blogId: string;
  readonly position: number;
  readonly notesMd: string | null;
  readonly visible: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class ClusterBlogPlacement {
  #state: IClusterBlogPlacementState;

  constructor(state: IClusterBlogPlacementState) {
    const normalized = { ...state };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get clusterBlogPlacementId(): string {
    return this.#state.clusterBlogPlacementId;
  }

  get clusterId(): string {
    return this.#state.clusterId;
  }

  get blogId(): string {
    return this.#state.blogId;
  }

  get position(): number {
    return this.#state.position;
  }

  get notesMd(): string | null {
    return this.#state.notesMd;
  }

  get visible(): boolean {
    return this.#state.visible;
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): IClusterBlogPlacementState {
    return structuredClone(this.#state);
  }

  changePosition(position: number): void {
    this.change({ position });
  }

  changeNotes(notesMd: string | null): void {
    this.change({ notesMd });
  }

  show(): void {
    this.change({ visible: true });
  }

  hide(): void {
    this.change({ visible: false });
  }

  private change(changes: Partial<IClusterBlogPlacementState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IClusterBlogPlacementState): void {
    if (!Number.isFinite(state.position)) {
      throw new RangeError('Position must be finite');
    }
    if (!state.clusterBlogPlacementId.trim()) {
      throw new RangeError('clusterBlogPlacementId is required');
    }
    if (!state.clusterId.trim()) {
      throw new RangeError('clusterId is required');
    }
    if (!state.blogId.trim()) {
      throw new RangeError('blogId is required');
    }
    if (!Number.isFinite(state.createdAt.getTime())) {
      throw new RangeError('Invalid createdAt instant');
    }
    if (!Number.isFinite(state.updatedAt.getTime())) {
      throw new RangeError('Invalid updatedAt instant');
    }
  }
}
