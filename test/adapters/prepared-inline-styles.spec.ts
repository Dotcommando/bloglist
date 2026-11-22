import { createHash } from 'node:crypto';

import { parse } from 'parse5';

import {
  inlineStyleHashes, prepareCompiledAssets, validatePreparedInlineStyles,
} from '../../src/adapters/outbound/rendering/html/inline-style-hashes.js';
import { walkHtml } from '../../src/adapters/outbound/rendering/modx/html-safety.js';

function domHashes(html: string): string[] {
  const result = new Set<string>();

  walkHtml(parse(html), (node) => {
    if ('tagName' in node && node.tagName === 'style') {
      const content = node.childNodes.map((child) => 'value' in child ? child.value : '').join('');

      result.add('sha256-' + createHash('sha256').update(content).digest('base64'));
    }
  });

  return [...result];
}

it.each([
  '<html><head></head><body><svg><style /></svg><style>a{color:red}</style></body></html>',
  '<html><head><noscript><style>a{color:red}</style></noscript></head><body></body></html>',
  '<!doctype html><html><head><style>a{color:red}</style></head><body><pre>  x\n y</pre></body></html>',
  '<html><head><style>\n/* comment */ a { color: red }\n</style></head><body><style></style></body></html>',
  '<html><head></head><body><textarea><style>ignored</style></textarea><script>"<style>ignored</style>"</script></body></html>',
  '<html><head></head><body><template><style>a{color:red}</style></template><style>a{color:red}</style></body></html>',
  '<html><head></head><body><svg><style>text{fill:red}</style></svg><style>p{color:blue}</style></body></html>',
  '<html><head><style>a{content:"&amp;"}</style></head><body></body></html>',
])('matches existing DOM-derived CSP hashes for %s', (html) => {
  expect(inlineStyleHashes(html)).toEqual(domHashes(html));
});

it('prepares immutable asset styles and never reuses their hash for different dynamic bytes', () => {
  const assets = prepareCompiledAssets({ head: '<style>p{color:red}</style>', body: '' });

  expect(assets.inlineStyles).toEqual([{
    content: 'p{color:red}',
    hash: domHashes(assets.head)[0],
  }]);
  const html = '<html><head>' + assets.head + '</head><body><style>p{color:blue}</style></body></html>';

  expect(inlineStyleHashes(html, assets.inlineStyles)).toEqual(domHashes(html));
  expect(() => validatePreparedInlineStyles([{ content: 'p{color:red}', hash: 'forged' }])).toThrow();
});
