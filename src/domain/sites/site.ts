import { SiteStatus } from './site-status.enum.js';

export interface ISiteState {
  readonly siteId: string;
  readonly mark: string;
  readonly name: string;
  readonly primaryDomain: string;
  readonly languages: readonly string[];
  readonly defaultLanguage: string;
  readonly status: SiteStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Site {
  #state: ISiteState;

  constructor(state: ISiteState) {
    const normalized = {
      ...state,
      name: state.name.trim(),
      primaryDomain: this.normalizePrimaryDomain(state.primaryDomain),
      languages: state.languages.map((language) => language.trim().toLowerCase()),
      defaultLanguage: state.defaultLanguage.trim().toLowerCase(),
    };

    this.validate(normalized);
    this.#state = structuredClone(normalized);
  }

  get siteId(): string {
    return this.#state.siteId;
  }

  get mark(): string {
    return this.#state.mark;
  }

  get name(): string {
    return this.#state.name;
  }

  get primaryDomain(): string {
    return this.#state.primaryDomain;
  }

  get languages(): readonly string[] {
    return structuredClone(this.#state.languages);
  }

  get defaultLanguage(): string {
    return this.#state.defaultLanguage;
  }

  get status(): SiteStatus {
    return this.#state.status;
  }

  get createdAt(): Date {
    return structuredClone(this.#state.createdAt);
  }

  get updatedAt(): Date {
    return structuredClone(this.#state.updatedAt);
  }

  toState(): ISiteState {
    return structuredClone(this.#state);
  }

  changeName(name: string): void {
    this.change({ name: name.trim() });
  }

  changePrimaryDomain(primaryDomain: string): void {
    this.change({ primaryDomain: this.normalizePrimaryDomain(primaryDomain) });
  }

  addLanguage(language: string): void {
    this.change({ languages: [...this.#state.languages, language.trim().toLowerCase()] });
  }

  removeLanguage(language: string): void {
    const normalized = language.trim().toLowerCase();

    if (normalized === this.defaultLanguage) {
      throw new RangeError('Cannot remove the default language');
    }
    this.change({ languages: this.#state.languages.filter((value) => value !== normalized) });
  }

  changeDefaultLanguage(defaultLanguage: string): void {
    this.change({ defaultLanguage: defaultLanguage.trim().toLowerCase() });
  }

  activate(): void {
    this.change({ status: SiteStatus.ACTIVE });
  }

  archive(): void {
    this.change({ status: SiteStatus.ARCHIVED });
  }

  private change(changes: Partial<ISiteState>): void {
    const next = { ...this.#state, ...changes };

    this.validate(next);
    this.#state = structuredClone(next);
  }

  private validate(state: ISiteState): void {
    if (state.languages.some((language) => !/^[a-z]{2}$/.test(language))) {
      throw new RangeError('Invalid language code');
    }
    if (new Set(state.languages).size !== state.languages.length) {
      throw new RangeError('Duplicate site languages');
    }
    if (!state.languages.includes(state.defaultLanguage)) {
      throw new RangeError('Default language must be enabled');
    }
    if (!state.primaryDomain || new URL(`https://${state.primaryDomain}`).hostname !== state.primaryDomain) {
      throw new RangeError('Expected a normalized hostname');
    }
    if (!state.siteId.trim()) {
      throw new RangeError('siteId is required');
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(state.mark)) {
      throw new RangeError('Invalid immutable mark');
    }
    if (!state.name.trim()) {
      throw new RangeError('name is required');
    }
    if (!Object.values(SiteStatus).includes(state.status)) {
      throw new RangeError('Invalid status');
    }
    if (!Number.isFinite(state.createdAt.getTime())) {
      throw new RangeError('Invalid createdAt instant');
    }
    if (!Number.isFinite(state.updatedAt.getTime())) {
      throw new RangeError('Invalid updatedAt instant');
    }
  }

  private normalizePrimaryDomain(primaryDomain: string): string {
    const value = primaryDomain.trim();
    const parsed = new URL(`https://${value}`);

    if (!value || /[/?#@\\\\]/.test(value) || parsed.port || parsed.username || parsed.password) {
      throw new RangeError('Expected a hostname without protocol, path, credentials or port');
    }

    return parsed.hostname;
  }
}
