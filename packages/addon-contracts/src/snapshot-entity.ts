export abstract class SnapshotEntity<TState> {
  #state: TState;

  protected constructor(state: TState) {
    this.#state = structuredClone(state);
  }

  toState(): TState {
    return structuredClone(this.#state);
  }

  protected replaceState(state: TState): void {
    this.#state = structuredClone(state);
  }
}
