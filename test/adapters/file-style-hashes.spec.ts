import { inlineStyleHashes } from '../../src/adapters/outbound/rendering/html/document-output.adapter.js';
import { fileStyleHashes } from '../../src/adapters/outbound/rendering/html/file-style-hashes.js';

it('computes the same CSP hashes from streamed UTF-8 HTML as the document parser', async () => {
  const html = '<!doctype html><html><head><style>p { color: red; }\r\n</style></head>'
    + '<body><style>p::after { content: "привет"; }</style></body></html>';
  const bytes = Buffer.from(html);

  expect(await fileStyleHashes({
    mimeType: 'text/html',
    byteSize: bytes.length,
    bytes: (async function* () {
      for (let offset = 0; offset < bytes.length; offset += 7) {
        yield bytes.subarray(offset, offset + 7);
      }
    })(),
  })).toEqual(inlineStyleHashes(html));
});
