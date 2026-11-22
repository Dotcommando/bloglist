import type { IPublishedDocument } from '../../../../domain/publication/published-document.js';
import type { ISnippet } from '../../../../ports/outbound/publication/data-loader.port.js';

export function readRefreshMessage(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid background rendering message');
  }

  return Object.fromEntries(Object.entries(value));
}

export function readRefreshDocument(value: unknown): IPublishedDocument {
  const document = readRefreshMessage(value);

  if (
    typeof document.html !== 'string'
    || typeof document.releaseId !== 'string'
    || typeof document.pageId !== 'string'
    || !Array.isArray(document.inlineStyleHashes)
    || !document.inlineStyleHashes.every((hash) => typeof hash === 'string')
    || document.markdown !== undefined
    && typeof document.markdown !== 'string'
    || document.cacheable !== undefined
    && typeof document.cacheable !== 'boolean'
  ) {
    throw new Error('Invalid background document');
  }

  return {
    html: document.html,
    releaseId: document.releaseId,
    pageId: document.pageId,
    inlineStyleHashes: document.inlineStyleHashes,
    ...(typeof document.markdown === 'string' ? { markdown: document.markdown } : {}),
    ...(typeof document.cacheable === 'boolean' ? { cacheable: document.cacheable } : {}),
  };
}

export enum RefreshMessageKind {
  Generate = 'generate',
  Read = 'read',
  Reply = 'reply',
  Result = 'result',
  Failure = 'failure',
}

export type RefreshRegistration = Omit<ISnippet, 'read'>;
