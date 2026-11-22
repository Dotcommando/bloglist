import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';

describe('Markdown conversion', () => {
  it('converts composed content and excludes document scaffolding and executable content', () => {
    const result = new MarkdownConversionAdapter().toMarkdown(`<!doctype html><html><head>
      <title>Hidden title</title><style>h1{color:red}</style></head><body>
      <nav>Site menu</nav><main><h1>Title</h1><p>Text <a href="/page">link</a></p>
      <img src="/image.webp" alt="Image description">
      <table><thead><tr><th>Name</th><th>Value</th></tr></thead>
      <tbody><tr><td>One</td><td>Two</td></tr></tbody></table>
      <article><p>Article</p><footer>Author: Jane</footer></article>
      <script>alert('bad')</script></main><footer>Site footer</footer></body></html>`);

    expect(result).toContain('# Title');
    expect(result).toContain('[link](/page)');
    expect(result).toContain('![Image description](/image.webp)');
    expect(result).toContain('| Name | Value |');
    expect(result).toContain('| One | Two |');
    expect(result).toContain('Author: Jane');
    expect(result).not.toMatch(/Hidden title|color:red|alert|Site menu|Site footer/);
  });
});
