import { crawlerRules } from '../../src/adapters/outbound/publication/files/crawler-rules.js';

describe('effective published robots rules', () => {
  it('honors parent rules, specific Allow exceptions, exact root and bot-specific prohibitions', () => {
    const rules = crawlerRules('User-agent: *\nDisallow: /private/\nAllow: /private/open$\nDisallow: /$\n'
      + 'User-agent: ExampleBot\nDisallow: /public/\n');

    expect(rules('/private/item').blockedBy[0]?.rule).toBe('Disallow: /private/');
    expect(rules('/private/open').blockedBy).toEqual([]);
    expect(rules('/private-other/').blockedBy).toEqual([]);
    expect(rules('/').blockedBy.length).toBeGreaterThan(0);
    expect(rules('/home').blockedBy).toEqual([]);
    expect(rules('/public/item').blockedBy).toMatchObject([{ agent: 'ExampleBot' }]);
  });
});
