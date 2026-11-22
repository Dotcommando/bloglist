import { type DefaultTreeAdapterMap, parse, parseFragment, serialize } from 'parse5';

import { requireCondition } from '../../../../domain/shared/validation.js';
import type { TemplateNode } from './tags.js';

type HtmlNode = DefaultTreeAdapterMap['node'];

export function walkHtml(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  visit(node);

  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      walkHtml(child, visit);
    }
  }
  if ('content' in node) {
    walkHtml(node.content, visit);
  }
}

export function escapeHtml(value: string): string {
  const fragment = parseFragment('');

  fragment.childNodes.push({ nodeName: '#text', value, parentNode: fragment });

  return serialize(fragment).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function validateContexts(nodes: readonly TemplateNode[], chunk: boolean): void {
  const dynamic = new Map<string, TemplateNode>();
  const html = nodes.map((node, index) => {
    if ('text' in node) {
      return node.text;
    }
    if (
      !['+', '*', '$', '~'].some((prefix) => node.name.startsWith(prefix))
      && !['Each', 'If'].includes(node.name)
    ) {
      return '';
    }

    const marker = `zaryaplaceholder${index}z`;

    dynamic.set(marker, node);

    return marker;
  }).join('');
  const tree = chunk ? parseFragment(html, { sourceCodeLocationInfo: true })
    : parse(html, { sourceCodeLocationInfo: true });

  if (chunk) {
    walkHtml(parse(html, { sourceCodeLocationInfo: true }), (node) => {
      requireCondition(!('tagName' in node && ['html', 'head', 'body'].includes(node.tagName)
        && node.sourceCodeLocation), 'Chunks cannot own document-level elements');
    });
  }
  if (!chunk) {
    // Composition markers in the head must not make the HTML parser infer a body.
    // Keep the text-marker tree below for attribute and dynamic-tag safety checks.
    const structureHtml = nodes.map((node, index) => {
      if ('text' in node) {
        return node.text;
      }
      if (!dynamic.has(`zaryaplaceholder${index}z`)) {
        return '';
      }

      return node.name.startsWith('$') || ['Each', 'If'].includes(node.name)
        ? `<!--zaryacomposition${index}-->` : `zaryaplaceholder${index}z`;
    }).join('');
    const structure = parse(structureHtml, { sourceCodeLocationInfo: true });

    for (const name of ['html', 'head', 'body']) {
      let found = false;

      walkHtml(structure, (node) => {
        if ('tagName' in node && node.tagName === name && node.sourceCodeLocation) {
          found = true;
        }
      });
      requireCondition(found, `Template needs an explicit ${name} element`);
    }
  }
  walkHtml(tree, (node) => {
    if (!('tagName' in node)) {
      return;
    }
    requireCondition(!['script', 'style'].includes(node.tagName), 'Use declared CSS and client.ts dependencies');
    requireCondition(!node.tagName.includes('zaryaplaceholder'), 'Dynamic tag names are forbidden');

    for (const attribute of node.attrs) {
      requireCondition(!attribute.name.startsWith('on') && attribute.name !== 'srcdoc'
        && attribute.name !== 'style' && !attribute.name.includes('zaryaplaceholder'), 'Unsafe attribute context');

      for (const [marker, tag] of dynamic) {
        if (!attribute.value.includes(marker)) {
          continue;
        }
        requireCondition('name' in tag && !tag.name.startsWith('$') && !['Each', 'If'].includes(tag.name),
          'Chunks cannot be included in attribute values');
        const location = node.sourceCodeLocation?.attrs?.[attribute.name];
        const authored = location ? html.slice(location.startOffset, location.endOffset) : '';

        requireCondition(/=\s*["']/.test(authored), 'Dynamic attributes must be quoted');
        requireCondition(!('name' in tag && tag.name.endsWith(':markdown')), 'Markdown is only allowed in text');
      }
    }
  });
}

export function validateOutput(html: string): void {
  walkHtml(parse(html), (node) => {
    if (!('tagName' in node)) {
      return;
    }

    for (const attribute of node.attrs) {
      if (['href', 'src', 'action', 'formaction', 'poster', 'xlink:href'].includes(attribute.name)) {
        const value = attribute.value.trim();

        requireCondition(!value.startsWith('//') && !value.includes('\\'), 'Unsafe URL');
        const url = new URL(value, 'https://zarya.invalid');

        requireCondition(['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol), 'Unsafe URL scheme');
      }
    }
  });
}
