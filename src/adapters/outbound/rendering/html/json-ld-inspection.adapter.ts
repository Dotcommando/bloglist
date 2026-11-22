import { type DefaultTreeAdapterMap, parse } from 'parse5';

import type { IJsonLdInspectionPort } from '../../../../ports/outbound/json-ld/json-ld-inspection.port.js';

export class JsonLdInspectionAdapter implements IJsonLdInspectionPort {
  read(html: string): string | null {
    let result: string | null = null;

    function visit(node: DefaultTreeAdapterMap['node']): void {
      if (
        'tagName' in node
        && node.tagName === 'script'
        && node.attrs.some((attr) => attr.name === 'data-zarya-json-ld')
      ) {
        if (result !== null) {
          throw new Error('Duplicate generated JSON-LD');
        }

        const text = node.childNodes.map((child) => 'value' in child ? child.value : '').join('');
        const value: unknown = JSON.parse(text);

        if (
          !value
          || typeof value !== 'object'
          || !('@context' in value)
          || value['@context'] !== 'https://schema.org'
          || !('@graph' in value)
          || !Array.isArray(value['@graph'])
        ) {
          throw new Error('Invalid generated JSON-LD');
        }
        result = JSON.stringify(value, null, 2);
      }
      if ('childNodes' in node) {
        for (const child of node.childNodes) {
          visit(child);
        }
      }
    }
    visit(parse(html));

    return result;
  }
}
