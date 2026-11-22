import { prefersMarkdown } from '../../src/adapters/inbound/gateway/http/markdown-negotiation.js';

describe('Markdown content negotiation', () => {
  it.each([
    [undefined, false],
    ['*/*', false],
    ['text/html,application/xhtml+xml,*/*;q=0.8', false],
    ['text/markdown', true],
    ['text/markdown;q=0', false],
    ['text/html;q=0.9,text/markdown;q=0.3', false],
    ['text/html;q=0.3,text/markdown;q=0.9', true],
    ['text/*;q=0.5,text/markdown;q=0', false],
  ])('selects the representation for %s', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});
