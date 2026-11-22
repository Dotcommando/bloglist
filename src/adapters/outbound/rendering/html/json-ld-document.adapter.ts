import { defaultTreeAdapter, type DefaultTreeAdapterMap, parse, serialize } from 'parse5';

import { type IJsonLdGraph, serializeJsonLd } from '../../../../domain/json-ld/json-ld-graph.js';
import type { IJsonLdDocumentPort } from '../../../../ports/outbound/json-ld/json-ld-document.port.js';

export class JsonLdDocumentAdapter implements IJsonLdDocumentPort {
  embed(html: string, graph: IJsonLdGraph | null): string {
    const document = parse(html);
    let head: DefaultTreeAdapterMap['element'] | null = null;

    function visit(node: DefaultTreeAdapterMap['node']): void {
      if ('tagName' in node) {
        if (node.tagName === 'head') {
          head = node;
        }
        if (node.tagName === 'script' && node.attrs.some((attr) => attr.name === 'data-zarya-json-ld')) {
          defaultTreeAdapter.detachNode(node);

          return;
        }
      }
      if ('childNodes' in node) {
        for (const child of [...node.childNodes]) {
          visit(child);
        }
      }
    }
    visit(document);

    if (graph && head) {
      const script = defaultTreeAdapter.createElement('script', defaultTreeAdapter.getNamespaceURI(head), [
        { name: 'type', value: 'application/ld+json' }, { name: 'data-zarya-json-ld', value: '' },
      ]);

      defaultTreeAdapter.insertText(script, serializeJsonLd(graph));
      defaultTreeAdapter.appendChild(head, script);
    }

    return serialize(document);
  }
}
