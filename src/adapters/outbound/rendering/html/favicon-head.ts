import { type DefaultTreeAdapterMap, parse, parseFragment } from 'parse5';

import { type ISiteFavicon, SITE_FAVICON_MIME_TYPE, SITE_FAVICON_PATH } from '../../../../domain/media/site-favicon.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { walkHtml } from '../modx/html-safety.js';

export function isSiteFaviconLink(node: DefaultTreeAdapterMap['node']): boolean {
  if (!('tagName' in node) || node.tagName !== 'link' || node.attrs.length !== 4) {
    return false;
  }

  const attributes = new Map(node.attrs.map((attribute) => [attribute.name, attribute.value]));

  return attributes.get('rel') === 'icon'
    && attributes.get('type') === SITE_FAVICON_MIME_TYPE
    && attributes.get('data-zarya-favicon') === ''
    && /^\/favicon\.ico\?v=[a-f0-9]{64}$/u.test(attributes.get('href') ?? '');
}

function project(html: string, icon: ISiteFavicon | null | undefined, document: boolean): string {
  if (icon === undefined) {
    return html;
  }
  if (icon) {
    requireCondition(/^[a-f0-9]{64}$/u.test(icon.version), 'Invalid favicon version');
  }

  const tree = document ? parse(html, { sourceCodeLocationInfo: true })
    : parseFragment(html, { sourceCodeLocationInfo: true });
  const removals: { start: number; end: number }[] = [];
  let insertion = document ? -1 : html.length;

  walkHtml(tree, (node) => {
    if (!('tagName' in node)) {
      return;
    }
    if (document && node.tagName === 'head') {
      insertion = node.sourceCodeLocation?.endTag?.startOffset ?? -1;
    }
    if (node.tagName === 'link' && node.attrs.some((attribute) => attribute.name === 'data-zarya-favicon')) {
      const location = node.sourceCodeLocation;

      if (location) {
        removals.push({ start: location.startOffset, end: location.endOffset });
      }
    }
  });

  if (icon) {
    requireCondition(insertion >= 0, 'Missing favicon head injection point');
  }

  const changes = removals.map((range) => ({ ...range, value: '' }));

  if (icon) {
    changes.push({
      start: insertion,
      end: insertion,
      value: '<link rel="icon" type="' + SITE_FAVICON_MIME_TYPE + '" href="'
        + SITE_FAVICON_PATH + '?v=' + icon.version + '" data-zarya-favicon>',
    });
  }

  return changes.sort((a, b) => b.start - a.start).reduce((text, change) =>
    text.slice(0, change.start) + change.value + text.slice(change.end), html);
}

export function faviconDocument(html: string, icon: ISiteFavicon | null | undefined): string {
  return project(html, icon, true);
}

export function faviconHead(head: string, icon: ISiteFavicon | null | undefined): string {
  return project(head, icon, false);
}
