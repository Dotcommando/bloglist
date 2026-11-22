import type { IJsonLdGraph } from '../../../domain/json-ld/json-ld-graph.js';

export interface IJsonLdDocumentPort {
  embed(html: string, graph: IJsonLdGraph | null): string;
}
