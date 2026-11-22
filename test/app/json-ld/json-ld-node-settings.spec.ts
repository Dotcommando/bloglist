import { BuildJsonLdPageUseCase } from '../../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind as Source, validateJsonLdCatalog } from '../../../src/domain/json-ld/json-ld-catalog.js';
import type { IBuildJsonLdPageInput } from '../../../src/ports/inbound/json-ld/build-json-ld-page.port.js';

function fixture(): IBuildJsonLdPageInput {
  return {
    siteId: 'site',
    pageId: 'page',
    templateId: 'template',
    origin: 'https://example.test',
    pageFields: {},
    templateValues: {},
    routes: [],
    snippetValues: { nearest: { present: true, sessionId: 'session-1', name: 'Meeting' } },
    catalog: {
      siteId: 'site',
      version: 'v1',
      objects: [],
      profiles: [{
        profileId: 'event',
        name: 'Event',
        templateIds: ['template'],
        nodes: [
          {
            role: 'webpage',
            type: 'WebPage',
            mappings: [{
              property: 'about', required: false, source: { kind: Source.CurrentNode, role: 'event' },
            }],
          },
          {
            role: 'event',
            type: 'Event',
            keySource: { kind: Source.Snippet, name: 'nearest', path: ['sessionId'] },
            presenceSource: { kind: Source.Snippet, name: 'nearest', path: ['present'] },
            mappings: [{
              property: 'name',
              required: true,
              source: { kind: Source.Snippet, name: 'nearest', path: ['name'] },
            }],
          },
        ],
      }],
    },
  };
}

it('uses a stable entity key across pages and updates current-node references when the entity changes', () => {
  const input = fixture();
  const builder = new BuildJsonLdPageUseCase();
  const graph = builder.execute(input)!.graph['@graph'];
  const event = graph.find((node) => node['@type'] === 'Event')!;

  expect(graph[0]!.about).toEqual({ '@id': event['@id'] });
  expect(builder.execute({ ...input, pageId: 'another-page' })!.graph['@graph'][1]!['@id']).toBe(event['@id']);
  const next = builder.execute({
    ...input, snippetValues: { nearest: { present: true, sessionId: 'session-2', name: 'Next meeting' } },
  })!.graph['@graph'];

  expect(next[1]!['@id']).not.toBe(event['@id']);
  expect(next[0]!.about).toEqual({ '@id': next[1]!['@id'] });
  expect(builder.execute({
    ...input,
    snippetValues: {
      nearest: {
        present: true, sessionId: 'session-1', name: 'Rescheduled meeting',
      },
    },
  })!.graph['@graph'][1]!['@id']).toBe(event['@id']);
});

it.each([false, null, undefined])('omits absent nodes before resolving required properties (%s)', (present) => {
  const input = fixture();
  const result = new BuildJsonLdPageUseCase().execute({ ...input, snippetValues: { nearest: { present } } });

  expect(result!.graph['@graph']).toHaveLength(1);
  expect(result!.graph['@graph'][0]).not.toHaveProperty('about');
});

it('rejects a required reference to an omitted node and missing or invalid identity/condition values', () => {
  const input = fixture();
  const builder = new BuildJsonLdPageUseCase();
  const run = (nearest: Record<string, unknown>): unknown => builder.execute({ ...input, snippetValues: { nearest } });

  expect(() => run({ present: true, name: 'Missing identity' })).toThrow('event.keySource');

  for (const present of ['false', '', 0, {}, []]) {
    expect(() => run({ present })).toThrow('event.presenceSource');
  }
  expect(() => run({ present: true, sessionId: 1 })).toThrow('event.keySource');
  expect(() => run({ present: true, sessionId: 'x'.repeat(129) })).toThrow('event.keySource');
  const catalog = {
    ...input.catalog,
    profiles: input.catalog.profiles.map((profile) => ({
      ...profile,
      nodes: profile.nodes.map((node) => ({
        ...node, mappings: node.mappings.map((mapping) => ({ ...mapping, required: true })),
      })),
    })),
  };

  expect(() => builder.execute({ ...input, catalog, snippetValues: {} })).toThrow();
});

it('validates deferred Request settings without evaluating missing data or bypassing known invalid data', () => {
  const builder = new BuildJsonLdPageUseCase();
  const input = fixture();

  expect(() => builder.validateDeferred({ ...input, snippetValues: {} })).not.toThrow();
  expect(() => builder.validateDeferred({
    ...input, snippetValues: { nearest: { present: 'false' } },
  })).toThrow('event.presenceSource');
  expect(() => builder.execute({
    ...input, snippetValues: { nearest: { present: true, sessionId: 'session-1' } },
  })).toThrow('event.name');
});

it('validates setting sources and retains legacy node identity when settings are absent', () => {
  const input = fixture();
  const invalid: unknown = {
    ...input.catalog,
    profiles: [{
      ...input.catalog.profiles[0],
      nodes: [{
        role: 'event',
        type: 'Event',
        mappings: [],
        keySource: { kind: Source.Page, pageId: 'foreign' },
      }],
    }],
  };

  expect(() => validateJsonLdCatalog(invalid)).toThrow();
  const legacy: IBuildJsonLdPageInput = {
    ...input,
    catalog: {
      ...input.catalog,
      profiles: [{
        ...input.catalog.profiles[0]!, nodes: [{ role: 'event', type: 'Event', mappings: [] }],
      }],
    },
  };
  const id = new BuildJsonLdPageUseCase().execute(legacy)!.graph['@graph'][0]!['@id'];

  expect(id).toBe('https://example.test/#event-page-' + Buffer.from(JSON.stringify(['page', 'event'])).toString('base64url'));
});
