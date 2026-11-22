import { createHash } from 'node:crypto';

import { parse } from 'parse5';
import { SAXParser } from 'parse5-sax-parser';

import type { ICompiledPageAssets, IPreparedInlineStyle } from '../../../../domain/publication/published-document.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { walkHtml } from '../modx/html-safety.js';

function styles(html: string, read: (content: string) => void): void {
  const parser = new SAXParser();
  const found: string[] = [];
  let content: string | null = null;
  let needsTree = false;

  parser.on('startTag', (tag) => {
    if (tag.tagName === 'style') {
      needsTree ||= tag.selfClosing;
      content = '';
    }
  });
  parser.on('text', (text) => {
    if (content !== null) {
      content += text.text;
    }
  });
  parser.on('endTag', (tag) => {
    if (tag.tagName === 'style' && content !== null) {
      found.push(content);
      content = null;
    }
  });
  parser.end(html);

  if (needsTree) {
    walkHtml(parse(html), (node) => {
      if ('tagName' in node && node.tagName === 'style') {
        read(node.childNodes.map((child) => 'value' in child ? child.value : '').join(''));
      }
    });
  } else {
    if (content !== null) {
      found.push(content);
    }
    found.forEach(read);
  }
}

function hash(content: string): string {
  return 'sha256-' + createHash('sha256').update(content).digest('base64');
}

/** Supplied pairs are verified once when the immutable plan is decoded. */
export function inlineStyleHashes(html: string, prepared: readonly IPreparedInlineStyle[] = []): readonly string[] {
  const known = new Map(prepared.map((style) => [style.content, style.hash]));
  const hashes = new Set<string>();

  styles(html, (content) => hashes.add(known.get(content) ?? hash(content)));

  return [...hashes];
}

export function validatePreparedInlineStyles(prepared: readonly IPreparedInlineStyle[]): void {
  for (const style of prepared) {
    requireCondition(style.hash === hash(style.content), 'Invalid prepared inline style hash');
  }
}

export function prepareCompiledAssets(assets: ICompiledPageAssets): ICompiledPageAssets {
  const inlineStyles = new Map<string, string>();

  styles(assets.head + assets.body, (content) => inlineStyles.set(content, hash(content)));

  return { ...assets, inlineStyles: [...inlineStyles].map(([content, hash]) => ({ content, hash })) };
}
