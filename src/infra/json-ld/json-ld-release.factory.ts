import {
  JsonLdReleaseProjectionAdapter,
} from '../../adapters/outbound/publication/files/json-ld-release-projection.adapter.js';
import { JsonLdDocumentAdapter } from '../../adapters/outbound/rendering/html/json-ld-document.adapter.js';
import { BuildJsonLdPageUseCase } from '../../app/use-cases/json-ld/build-json-ld-page.use-case.js';
import type { IJsonLdReleaseProjectionPort } from '../../ports/outbound/json-ld/json-ld-release-projection.port.js';

export function jsonLdReleaseProjection(): IJsonLdReleaseProjectionPort {
  return new JsonLdReleaseProjectionAdapter(new BuildJsonLdPageUseCase(), new JsonLdDocumentAdapter());
}
