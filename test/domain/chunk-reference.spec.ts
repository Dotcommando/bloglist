import { chunkNameAlias, resolveChunkReference } from '../../src/domain/publication/chunk-reference.policy.js';
import { source } from '../support/publication.js';

describe('chunk name references', () => {
  it('replaces each whitespace character with an underscore without changing case or stored names', () => {
    expect(chunkNameAlias('Date Chunk')).toBe('Date_Chunk');
    expect(chunkNameAlias('Date  Chunk')).toBe('Date__Chunk');
    expect(chunkNameAlias('Дата события')).toBe('Дата_события');
    expect(chunkNameAlias('Дата\u00a0события')).toBe('Дата_события');
    expect(chunkNameAlias('Date-Chunk.2026')).toBe('Date-Chunk.2026');
    expect(chunkNameAlias('Date?Chunk')).toBeNull();
  });
  it('keeps keys first, resolves names exactly and rejects unknown, ambiguous and renamed references', () => {
    const chunk = source('').templates[1]!;
    const one = { ...chunk, id: '1', name: 'Date Chunk' };

    expect(resolveChunkReference([one], 'Date_Chunk')).toBe(one);
    expect(resolveChunkReference([one], '1')).toBe(one);
    expect(() => resolveChunkReference([one], 'date_Chunk')).toThrow('Unknown');
    expect(() => resolveChunkReference([{ ...one, name: 'Renamed' }], 'Date_Chunk')).toThrow('Unknown');
    expect(() => resolveChunkReference([one, { ...one, id: '2', name: 'Date_Chunk' }], 'Date_Chunk'))
      .toThrow('Ambiguous');
    expect(resolveChunkReference([one, { ...one, id: '2', name: '1' }], '1')).toBe(one);
  });
});
