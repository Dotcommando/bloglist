import { createHash, type Hash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import { SAXParser } from 'parse5-sax-parser';

import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';

export async function fileStyleHashes(content: IBinaryContent): Promise<readonly string[]> {
  const parser = new SAXParser();
  const hashes = new Set<string>();
  let active: Hash | null = null;
  const finishStyle = (): void => {
    if (active) {
      hashes.add('sha256-' + active.digest('base64'));
      active = null;
    }
  };

  parser.on('startTag', (tag) => {
    if (tag.tagName === 'style') {
      active = createHash('sha256');
    }
  });
  parser.on('text', (text) => {
    active?.update(text.text);
  });
  parser.on('endTag', (tag) => {
    if (tag.tagName === 'style' && active) {
      finishStyle();
    }
  });
  const text = async function* (): AsyncGenerator<string> {
    const decoder = new TextDecoder();

    for await (const chunk of content.bytes) {
      yield decoder.decode(chunk, { stream: true });
    }
    yield decoder.decode();
  };

  await pipeline(text(), parser, async (source) => {
    for await (const chunk of source) {
      void chunk;
    }
  });

  finishStyle();

  return [...hashes];
}
