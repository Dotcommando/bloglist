import { parse, serialize } from 'parse5';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import type { IMarkdownConversionPort } from '../../../../ports/outbound/publication/markdown-conversion.port.js';

export class MarkdownConversionAdapter implements IMarkdownConversionPort {
  toMarkdown(html: string): string {
    const document = parse(html);
    const root = document.childNodes.find((node) => node.nodeName === 'html');
    const body = root && 'childNodes' in root
      ? root.childNodes.find((node) => node.nodeName === 'body') : undefined;
    const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

    converter.use(gfm);
    converter.remove(['script', 'style', 'noscript', 'template', 'nav']);
    converter.remove((node) => {
      if (node.nodeName !== 'FOOTER') {
        return false;
      }

      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.nodeName === 'MAIN' || parent.nodeName === 'ARTICLE') {
          return false;
        }
      }

      return true;
    });

    return converter.turndown(body && 'childNodes' in body ? serialize(body) : '');
  }
}
