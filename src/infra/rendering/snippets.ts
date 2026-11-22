import { PaginationSnippet } from '../../app/services/publication/pagination.snippet.js';
import type { ISnippet } from '../../ports/outbound/publication/data-loader.port.js';

export function registeredSnippets(custom: readonly ISnippet[] = []): readonly ISnippet[] {
  const snippets = [new PaginationSnippet(), ...custom];

  if (new Set(snippets.map((snippet) => snippet.id)).size !== snippets.length) {
    throw new RangeError('Duplicate Snippet registration');
  }

  return snippets;
}
