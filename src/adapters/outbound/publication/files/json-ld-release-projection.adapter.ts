import { jsonLdRoutes } from '../../../../domain/json-ld/json-ld-routes.js';
import { JsonLdValidationError } from '../../../../domain/json-ld/json-ld-validation.error.js';
import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import { PublicationConsistencyError } from '../../../../domain/publication/published-document.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import type { IBuildJsonLdPage } from '../../../../ports/inbound/json-ld/build-json-ld-page.port.js';
import type { IJsonLdDocumentPort } from '../../../../ports/outbound/json-ld/json-ld-document.port.js';
import type {
  IJsonLdReleaseProjectionPort,
} from '../../../../ports/outbound/json-ld/json-ld-release-projection.port.js';
import { artifact, checksum } from '../../rendering/vite/artifacts.js';
import { jsonLdPagePath } from './json-ld-artifacts.js';
import { decodeJsonLdPageValues } from './json-ld-decoder.js';
import { decodePageSnapshot, pageSnapshotPath } from './page-content-snapshot.js';
import { decodePlan } from './plan-decoder.js';

async function text(file: IPublicationArtifact): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of file.content.bytes) {
    size += chunk.byteLength;

    if (size > file.byteSize) {
      throw new PublicationConsistencyError('Oversized JSON-LD release artifact');
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);

  if (size !== file.byteSize || checksum(bytes) !== file.checksum) {
    throw new PublicationConsistencyError('Corrupt JSON-LD release artifact');
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export class JsonLdReleaseProjectionAdapter implements IJsonLdReleaseProjectionPort {
  constructor(private readonly graphs: IBuildJsonLdPage, private readonly document: IJsonLdDocumentPort) {}

  async refresh(input: Parameters<IJsonLdReleaseProjectionPort['refresh']>[0]): Promise<IPublicationArtifact[]> {
    const files = new Map(input.artifacts.map((file) => [file.path, file]));
    const routes = jsonLdRoutes(input.routes.map((route) => ({
      urlId: route.urlId,
      path: route.path,
      pageId: route.kind === PublishedRouteKind.Redirect ? null : route.pageId,
      targetUrlId: route.kind === PublishedRouteKind.Redirect ? route.targetUrlId : null,
    })));
    const bindings: { pageId: string; templateId: string }[] = [];

    for (const route of input.routes) {
      if (route.kind === PublishedRouteKind.Redirect) {
        continue;
      }

      const name = route.kind === PublishedRouteKind.Request ? `plans/${route.renderPlanId}.json`
        : jsonLdPagePath(route.pageId);
      const file = files.get(name);

      if (file) {
        if (file.public) {
          throw new PublicationConsistencyError('Public JSON-LD inputs');
        }

        const serialized = await text(file);
        const raw: unknown = JSON.parse(serialized);
        const saved = route.kind === PublishedRouteKind.Request ? decodePlan(raw).plan
          : decodeJsonLdPageValues(raw, input.siteId);

        if (saved.siteId !== input.siteId || saved.pageId !== route.pageId) {
          throw new PublicationConsistencyError('Foreign JSON-LD published binding');
        }
        bindings.push({
          pageId: saved.pageId,
          templateId: 'templateId' in saved
            ? saved.templateId : saved.rendering.templateId,
        });
        files.set(name, artifact(name, file.mimeType, serialized, false));
      } else if (input.context?.catalog.profiles.length && route.kind === PublishedRouteKind.Static) {
        const pageFile = files.get(pageSnapshotPath(route.pageId));

        if (!pageFile || pageFile.public) {
          throw new JsonLdValidationError('Republish the complete site to capture published JSON-LD inputs');
        }

        const serialized = await text(pageFile);
        const page = decodePageSnapshot(JSON.parse(serialized), input.siteId, route.pageId);

        files.set(pageFile.path, artifact(pageFile.path, pageFile.mimeType, serialized, false));

        if (
          page.rendering
          && input.context.catalog.profiles.some((profile) =>
            profile.templateIds.includes(page.rendering!.templateId))
        ) {
          throw new JsonLdValidationError('Republish the complete site to capture published JSON-LD inputs');
        }
      }
    }
    const retained = new Set(input.routes.flatMap((route) => route.kind === PublishedRouteKind.Static
      ? [jsonLdPagePath(route.pageId)] : []));

    for (const name of files.keys()) {
      if (name.startsWith('json-ld/') && !retained.has(name)) {
        files.delete(name);
      }
    }

    for (const route of input.routes) {
      if (route.kind === PublishedRouteKind.Redirect) {
        continue;
      }
      if (route.kind === PublishedRouteKind.Request) {
        const file = files.get(`plans/${route.renderPlanId}.json`);

        if (!file || file.public) {
          throw new PublicationConsistencyError('Missing private Request plan');
        }

        const serialized = await text(file);
        const raw: unknown = JSON.parse(serialized);
        const saved = decodePlan(raw);

        if (saved.plan.siteId !== input.siteId || saved.plan.pageId !== route.pageId) {
          throw new PublicationConsistencyError('Foreign Request plan in JSON-LD release');
        }

        const context = input.context ?? saved.plan.jsonLd;

        if (context) {
          this.graphs.validateDeferred({
            ...context,
            bindings,
            routes,
            origin: input.origin ?? context.origin,
            siteId: input.siteId,
            pageId: saved.plan.pageId,
            templateId: saved.plan.rendering.templateId,
            pageFields: { ...saved.plan.page },
            templateValues: saved.plan.templateValues ?? {},
            snippetValues: {},
          });
        }
        files.set(file.path, context ? artifact(file.path, file.mimeType, JSON.stringify({
          ...saved.plan,
          assets: saved.assets,
          jsonLd: { ...context, bindings, routes, origin: input.origin ?? context.origin },
        }), false) : artifact(file.path, file.mimeType, serialized, false));
        continue;
      }

      const valuesFile = files.get(jsonLdPagePath(route.pageId));

      if (!valuesFile) {
        continue;
      }
      if (valuesFile.public) {
        throw new PublicationConsistencyError('JSON-LD inputs must remain private');
      }

      const frozen = decodeJsonLdPageValues(JSON.parse(await text(valuesFile)), input.siteId);

      if (frozen.pageId !== route.pageId) {
        throw new PublicationConsistencyError('Foreign JSON-LD page inputs');
      }

      const values = {
        ...frozen,
        bindings,
        catalog: input.context?.catalog ?? frozen.catalog,
        origin: input.origin ?? input.context?.origin ?? frozen.origin,
        routes,
      };
      const graph = this.graphs.execute(values);
      const document = files.get(route.documentPath);

      if (document?.mimeType !== 'text/html' || !document.public) {
        throw new PublicationConsistencyError('Missing JSON-LD HTML document');
      }

      const html = await text(document);

      files.set(document.path, artifact(document.path, 'text/html', this.document.embed(html, graph?.graph ?? null)));
      files.set(valuesFile.path, artifact(valuesFile.path, 'application/json', JSON.stringify(values), false));
    }

    return [...files.values()];
  }
}
