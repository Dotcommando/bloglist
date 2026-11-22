import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

import { requireCondition } from '../../../../domain/shared/validation.js';

export async function renderMarkdown(value: string | null, trusted: boolean,
  resolvePageLink: (number: string) => string): Promise<string> {
  const markdown = new Marked({
    walkTokens: (token) => {
      if (token.type !== 'link' || !token.href.startsWith('[[~')) {
        return;
      }

      const match = /^\[\[~([1-9][0-9]{0,18})\]\]$/.exec(token.href);

      requireCondition(match !== null, 'Invalid Markdown page link');
      token.href = resolvePageLink(match![1]!);
    },
  });
  const parsed = await markdown.parse(value ?? '');

  return trusted ? parsed : sanitizeHtml(parsed, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'picture', 'source'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'srcset', 'sizes', 'loading', 'decoding'],
      source: ['srcset', 'sizes', 'type', 'width', 'height', 'media'],
    },
  });
}
