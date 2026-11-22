import { faviconDocument, faviconHead } from '../../src/adapters/outbound/rendering/html/favicon-head.js';

const icon = { byteSize: 100, width: 32, height: 32, version: 'a'.repeat(64) };

it('adds, replaces and removes exactly the managed favicon without changing unrelated markup', () => {
  const html = '<!doctype html><html><head><title>Published</title></head><body>Drafts stay private</body></html>';
  const first = faviconDocument(html, icon);

  expect(first).toContain('href="/favicon.ico?v=' + icon.version + '"');
  expect(first).toContain('rel="icon"');
  expect(faviconDocument(first, icon)).toBe(first);
  const next = faviconDocument(first, { ...icon, version: 'b'.repeat(64) });

  expect(next).not.toContain(icon.version);
  expect(faviconDocument(next, null)).toBe(html);
  expect(faviconDocument(html, null)).toBe(html);
  expect(faviconHead(faviconHead('<style>body{color:red}</style>', icon), null))
    .toBe('<style>body{color:red}</style>');
  expect(() => faviconHead('', { ...icon, version: '"><script>bad</script>' })).toThrow();
  expect(faviconDocument(html, undefined)).toBe(html);
});
