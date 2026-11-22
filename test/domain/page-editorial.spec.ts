import { changedPageFields, editableValuesEqual } from '../../src/domain/pages/page-editorial.policy.js';
import { pageFixture } from '../support/pages.js';

it('ignores lifecycle metadata, key ordering and frozen defaults, preserving page-owned choices', () => {
  const original = pageFixture().toState();
  const published = {
    ...original,
    tvValues: { defaultNote: 'Frozen', image: { alt: '', fileId: 'a' } },
    authoredTvValues: { image: { fileId: 'a', alt: '' } },
  };
  const draft = { ...original, tvValues: { image: { alt: '', fileId: 'a' } }, updatedAt: new Date(1) };

  expect(changedPageFields(draft, published)).toEqual([]);
  expect(changedPageFields({ ...draft, tvValues: {} }, published)).toEqual(['tvValues.image']);

  for (const value of [undefined, null, false, 0, '']) {
    for (const other of [undefined, null, false, 0, '']) {
      expect(editableValuesEqual(value, other)).toBe(Object.is(value, other));
    }
  }
});
