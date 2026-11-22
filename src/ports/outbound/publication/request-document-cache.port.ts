import type { IPublishedDocument } from '../../../domain/publication/published-document.js';

export interface IRequestDocumentCacheEntry {
  readonly siteId: string;
  readonly expiresAt: number;
  readonly document: IPublishedDocument;
}

export interface IRequestDocumentCachePort {
  onInvalidation?(listener: () => void): () => void;
  now(): number;
  digest(value: unknown): string;
  generation(): number;
  get(key: string): IRequestDocumentCacheEntry | null;
  put(key: string, entry: IRequestDocumentCacheEntry): void;
  purge(siteId?: string): void;
}
