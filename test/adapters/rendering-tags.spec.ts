import { tokenize } from '../../src/adapters/outbound/rendering/modx/tags.js';

describe('numeric rendering references', () => {
  it('permits numeric chunks and snippets while preserving placeholder and page-field syntax', () => {
    expect(tokenize('[[$1? &title=`[[*title]]`]]')).toEqual([expect.objectContaining({
      name: '$1', parameters: { title: '[[*title]]' },
    })]);

    expect(tokenize('[[$Дата_события]]')).toEqual([expect.objectContaining({ name: '$Дата_события' })]);
    expect(tokenize('[[!1? &as=`data`]]')).toEqual([expect.objectContaining({
      name: '1', request: true, parameters: { as: 'data' },
    })]);
    expect(tokenize('[[!Мой_сниппет? &as=`data`]]')).toEqual([expect.objectContaining({
      name: 'Мой_сниппет', request: true,
    })]);

    for (const tag of ['[[+1]]', '[[*1]]', '[[++1]]', '[[$1:markdown]]']) {
      expect(() => tokenize(tag)).toThrow();
    }
  });
});
