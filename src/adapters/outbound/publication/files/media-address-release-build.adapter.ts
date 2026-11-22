import { MAX_DOCUMENT_BYTES } from '../../../../domain/media/media-policy.js';
import {
  type IMediaPathReplacement, type IMediaReferenceRewriter, mediaReferenceRewriter,
} from '../../../../domain/media/media-reference-rewrite.policy.js';
import type { ISiteFavicon } from '../../../../domain/media/site-favicon.js';
import type { TemplateValue } from '../../../../domain/pages/page-rendering.js';
import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import { ReleaseState } from '../../../../domain/publication/publication-release.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type {
  IMediaAddressReleaseBuild, IMediaAddressReleaseBuildInput,
} from '../../../../ports/outbound/publication/media-address-release-build.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../../ports/outbound/publication/publication-artifact-source.port.js';
import { faviconDocument, faviconHead } from '../../rendering/html/favicon-head.js';
import { prepareCompiledAssets } from '../../rendering/html/inline-style-hashes.js';
import { isTemplateObject } from '../../rendering/modx/parameters.js';
import { artifact } from '../../rendering/vite/artifacts.js';
import { decodePlan } from './plan-decoder.js';

async function readText(file: IPublicationArtifact): Promise<string> {
  requireCondition(file.byteSize <= MAX_DOCUMENT_BYTES, 'Frozen text artifact is too large');
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of file.content.bytes) {
    size += chunk.byteLength;
    requireCondition(size <= file.byteSize && size <= MAX_DOCUMENT_BYTES, 'Frozen text exceeds declared size');
    chunks.push(chunk);
  }
  requireCondition(size === file.byteSize, 'Truncated frozen text artifact');

  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

function jsonValue(value: unknown): TemplateValue {
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(jsonValue);
  }
  if (isTemplateObject(value)) {
    return value;
  }
  throw new Error('Invalid frozen JSON');
}

function frozenPage(original: TemplateValue | undefined,
  changed: TemplateValue | undefined): TemplateValue | undefined {
  if (!isTemplateObject(original) || !isTemplateObject(changed) || typeof original.pageId !== 'string') {
    return changed;
  }

  const result = { ...original };

  for (const field of ['contentMd', 'ogImage', 'rendering', 'tvValues', 'authoredTvValues']) {
    if (Object.hasOwn(changed, field)) {
      result[field] = changed[field]!;
    }
  }

  return result;
}

function rewriteJson(raw: TemplateValue, rewrite: IMediaReferenceRewriter, plan: boolean,
  favicon?: ISiteFavicon | null): TemplateValue {
  const value = rewrite.value(raw);

  if (!isTemplateObject(raw) || !isTemplateObject(value)) {
    return value;
  }

  const mapped: Record<string, TemplateValue> = { ...value };

  if (Object.hasOwn(raw, 'page')) {
    mapped.page = frozenPage(raw.page, mapped.page)!;
  }
  if (favicon !== undefined) {
    const assets = mapped.assets;

    requireCondition(isTemplateObject(assets) && typeof assets.head === 'string', 'Invalid frozen favicon assets');

    if (isTemplateObject(assets) && typeof assets.head === 'string') {
      mapped.assets = { ...assets, head: faviconHead(assets.head, favicon) };
    }
  }
  if (plan) {
    const assets = mapped.assets;

    requireCondition(isTemplateObject(assets) && typeof assets.head === 'string' && typeof assets.body === 'string',
      'Invalid frozen assets');

    if (isTemplateObject(assets) && typeof assets.head === 'string' && typeof assets.body === 'string') {
      const prepared = prepareCompiledAssets({ head: assets.head, body: assets.body });

      mapped.assets = {
        head: prepared.head,
        body: prepared.body,
        inlineStyles: prepared.inlineStyles?.map((style) => ({ content: style.content, hash: style.hash })) ?? [],
      };
    }
    decodePlan(mapped);
  }

  return mapped;
}

/** Revises compiled output and frozen values; it never calls a source loader or compiler. */
export class MediaAddressReleaseBuildAdapter implements IMediaAddressReleaseBuild {
  constructor(private readonly source: IPublicationArtifactSourcePort) {}

  async build(input: IMediaAddressReleaseBuildInput): ReturnType<IMediaAddressReleaseBuild['build']> {
    const previous = input.previous;

    requireCondition(previous.siteId === input.siteId && previous.state === ReleaseState.Ready
      && previous.manifest !== null && previous.releaseId !== input.releaseId, 'Foreign or invalid media release');
    const manifest = previous.manifest!;
    const originals = await this.source.readArtifacts(input.siteId, previous.releaseId);

    requireCondition(originals.length === manifest.artifacts.length && manifest.artifacts.every((entry) =>
      originals.some((file) => file.path === entry.path && file.checksum === entry.checksum
        && file.byteSize === entry.byteSize && file.mimeType === entry.mimeType && file.public === entry.public)),
    'Frozen media inventory differs from the selected release');
    const media = mediaReferenceRewriter(input.paths, input.origins);
    const texts = new Map<string, string>();
    const json = new Map<string, TemplateValue>();
    let changed = false;

    for (const file of originals) {
      if (!/^(?:text\/|application\/(?:json|[^;]+\+json|javascript|xml)|image\/svg\+xml)/u.test(file.mimeType)) {
        continue;
      }

      const body = await readText(file);

      texts.set(file.path, body);

      if (/^(?:application\/(?:json|[^;]+\+json))(?:;|$)/u.test(file.mimeType)) {
        const raw = jsonValue(JSON.parse(body));

        if (file.path.startsWith('plans/')) {
          decodePlan(raw);
        }
        json.set(file.path, raw);
        changed ||= JSON.stringify(rewriteJson(raw, media, false,
          file.path.startsWith('plans/') ? input.favicon : undefined)) !== JSON.stringify(raw);
      } else {
        changed ||= (file.public && /^text\/html(?:;|$)/u.test(file.mimeType)
          ? faviconDocument(media.text(body), input.favicon) : media.text(body)) !== body;
      }
    }
    const publishedPages = manifest.publishedPages?.map((page) => ({
      ...page,
      ...(page.tv === undefined ? {} : { tv: media.object(page.tv) }),
      ...(page.tvValues === undefined ? {} : { tvValues: media.object(page.tvValues) }),
    }));

    changed ||= JSON.stringify(publishedPages) !== JSON.stringify(manifest.publishedPages);

    if (!changed) {
      return { changed: false, artifacts: originals, manifest };
    }

    const prefixes = new Set(['/assets/releases/' + encodeURIComponent(previous.releaseId) + '/']);
    const redirects = texts.get('_redirects') ?? '';

    for (const line of redirects.split('\n')) {
      const match = /^(\/assets\/releases\/[A-Za-z0-9_%~-]+\/)\* \/assets\/:splat 200$/u.exec(line);

      if (match) {
        prefixes.add(match[1]!);
      }
    }
    const rebased: IMediaPathReplacement[] = originals.filter((file) => file.public && file.path.startsWith('assets/'))
      .flatMap((file) => {
        const relative = file.path.slice('assets/'.length);
        const to = '/assets/releases/' + encodeURIComponent(input.releaseId) + '/' + relative;

        return [{ from: '/' + file.path, to }, ...[...prefixes].map((prefix) => ({ from: prefix + relative, to }))];
      });
    const rewrite = mediaReferenceRewriter([...rebased, ...input.paths], input.origins);
    const artifacts = originals.map((file) => {
      const body = texts.get(file.path);

      if (body === undefined) {
        return file;
      }

      const raw = json.get(file.path);
      const result = raw === undefined
        ? (file.public && /^text\/html(?:;|$)/u.test(file.mimeType)
          ? faviconDocument(rewrite.text(body), input.favicon) : rewrite.text(body))
        : JSON.stringify(rewriteJson(raw, rewrite, file.path.startsWith('plans/'),
          file.path.startsWith('plans/') ? input.favicon : undefined));

      return artifact(file.path, file.mimeType, result, file.public);
    });
    const alias = '/assets/releases/' + encodeURIComponent(input.releaseId) + '/* /assets/:splat 200\n';
    const previousRedirects = artifacts.find((file) => file.path === '_redirects');
    const rules = previousRedirects ? await readText(previousRedirects) : '';

    artifacts.splice(0, artifacts.length, ...artifacts.filter((file) => file.path !== '_redirects'),
      artifact('_redirects', 'text/plain', rules + (rules && !rules.endsWith('\n') ? '\n' : '') + alias));

    return {
      changed: true,
      artifacts,
      manifest: {
        ...manifest,
        ...(publishedPages === undefined ? {} : { publishedPages }),
        artifacts: artifacts.map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
          ({ path, mimeType, byteSize, checksum, public: publicFile })),
      },
    };
  }
}
