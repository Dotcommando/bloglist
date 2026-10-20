import { BloggerStatus } from './blogger-status.enum.js';
import { BloggerType } from './blogger-type.enum.js';

export interface IBloggerState {
  readonly bloggerId: string;
  readonly mark: string;
  readonly name: string;
  readonly type: BloggerType;
  readonly country: string | null;
  readonly website: string | null;
  readonly contactEmail: string | null;
  readonly notesMd: string | null;
  readonly status: BloggerStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Blogger {
  #state: IBloggerState;

  constructor(state: IBloggerState) {
    const normalized = {
      ...state,
      name: state.name.trim(),
      contactEmail: state.contactEmail?.trim().toLowerCase() ?? null,
    };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get bloggerId(): string {
    return this.#state.bloggerId;
  }

  get mark(): string {
    return this.#state.mark;
  }

  get name(): string {
    return this.#state.name;
  }

  get type(): BloggerType {
    return this.#state.type;
  }

  get country(): string | null {
    return this.#state.country;
  }

  get website(): string | null {
    return this.#state.website;
  }

  get contactEmail(): string | null {
    return this.#state.contactEmail;
  }

  get notesMd(): string | null {
    return this.#state.notesMd;
  }

  get status(): BloggerStatus {
    return this.#state.status;
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): IBloggerState {
    return structuredClone(this.#state);
  }

  rename(name: string): void {
    this.change({ name: name.trim() });
  }

  changeType(type: BloggerType): void {
    this.change({ type });
  }

  changeCountry(country: string | null): void {
    this.change({ country: country?.trim() ?? null });
  }

  changeWebsite(website: string | null): void {
    this.change({ website: website?.trim() ?? null });
  }

  changeContactEmail(contactEmail: string | null): void {
    this.change({ contactEmail: contactEmail?.trim().toLowerCase() ?? null });
  }

  changeNotes(notesMd: string | null): void {
    this.change({ notesMd });
  }

  activate(): void {
    this.change({ status: BloggerStatus.ACTIVE });
  }

  deactivate(): void {
    this.change({ status: BloggerStatus.INACTIVE });
  }

  private change(changes: Partial<IBloggerState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: IBloggerState): void {
    if (!state.bloggerId.trim()) {
      throw new RangeError('bloggerId is required');
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(state.mark)) {
      throw new RangeError('Invalid immutable mark');
    }
    if (!state.name.trim()) {
      throw new RangeError('name is required');
    }
    if (!Object.values(BloggerType).includes(state.type)) {
      throw new RangeError('Invalid type');
    }
    if (!Object.values(BloggerStatus).includes(state.status)) {
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
