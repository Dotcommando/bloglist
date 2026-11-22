import { requireCondition } from '../shared/validation.js';
import { type ITemplateSource, TemplateSourceKind } from './render-plan.js';

export function chunkNameAlias(name: string): string | null {
  const alias = name.replace(/\s/gu, '_');

  return /^[\p{L}\p{M}\p{N}_.-]{1,200}$/u.test(alias) ? alias : null;
}

export function resolveChunkReference(sources: readonly ITemplateSource[], reference: string): ITemplateSource {
  const chunks = sources.filter((source) => source.kind === TemplateSourceKind.Chunk);
  const keyed = chunks.find((source) => source.id === reference);

  if (keyed) {
    return keyed;
  }

  const matches = chunks.filter((source) => source.name !== undefined && chunkNameAlias(source.name) === reference);

  requireCondition(matches.length > 0, `Unknown chunk: ${reference}`);
  requireCondition(matches.length === 1, `Ambiguous chunk name: ${reference}; use its key`);

  return matches[0]!;
}
