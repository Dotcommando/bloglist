import { SystemDocument } from '../../../../domain/pages/document-mime.js';
import { OpenGraphType } from '../../../../domain/pages/open-graph-type.enum.js';
import { Page } from '../../../../domain/pages/page.js';
import {
  BrowserInteraction,
  HtmlDelivery,
  type IDataLoaderBinding,
  type IPageRendering,
  type ITemplateObject,
  LoaderPhase,
} from '../../../../domain/pages/page-rendering.js';
import { PageStatus } from '../../../../domain/pages/page-status.enum.js';
import { PageType } from '../../../../domain/pages/page-type.enum.js';
import {
  type ICompiledPageAssets,
  PublicationConsistencyError,
} from '../../../../domain/publication/published-document.js';
import { validatePublishedPages } from '../../../../domain/publication/published-page-summary.js';
import {
  type IRenderPlan,
  type ITemplateSource,
  TemplateSourceKind,
} from '../../../../domain/publication/render-plan.js';
import {
  parseRequestCachePolicy, parseSnippetCachePolicy,
} from '../../../../domain/publication/request-cache.policy.js';
import { parseSnippetSource } from '../../../../domain/rendering/snippet-source.policy.js';
import { contracts } from '../../rendering/modx/parameter-contracts.js';
import { isTemplateObject } from '../../rendering/modx/parameters.js';
import { decodeJsonLdContext } from './json-ld-decoder.js';

function object(value: unknown): ITemplateObject {
  if (!isTemplateObject(value)) {
    throw new PublicationConsistencyError('Expected stored object');
  }

  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PublicationConsistencyError('Expected stored text');
  }

  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new PublicationConsistencyError('Expected stored boolean');
  }

  return value;
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new PublicationConsistencyError('Expected stored array');
  }

  return value;
}

function instant(value: unknown): Date {
  const string = text(value);
  const date = new Date(string);

  if (!Number.isFinite(date.getTime()) || date.toISOString() !== string) {
    throw new PublicationConsistencyError('Expected a stored UTC instant');
  }

  return date;
}

function choice<T extends string>(values: readonly T[], value: unknown): T {
  const result = values.find((item) => item === value);

  if (result === undefined) {
    throw new PublicationConsistencyError('Unknown stored enum value');
  }

  return result;
}

function binding(value: unknown): IDataLoaderBinding {
  const item = object(value);

  return {
    loaderId: text(item.loaderId),
    alias: text(item.alias),
    phase: choice(Object.values(LoaderPhase), item.phase),
    parameters: object(item.parameters),
    dependsOn: list(item.dependsOn).map(text),
    required: flag(item.required),
  };
}

function rendering(value: unknown): IPageRendering {
  const item = object(value);

  return {
    templateId: text(item.templateId),
    delivery: choice(Object.values(HtmlDelivery), item.delivery),
    interaction: choice(Object.values(BrowserInteraction), item.interaction),
    parameters: object(item.parameters),
    loaders: list(item.loaders).map(binding),
    ...(item.requestCache === undefined ? {} : { requestCache: parseRequestCachePolicy(item.requestCache) }),
  };
}

export function decodePublishedPage(value: unknown): Page {
  const p = object(value);
  const page = new Page({
    pageNumber: p.pageNumber == null ? null : text(p.pageNumber),
    parentPageId: p.parentPageId == null ? null : text(p.parentPageId),
    sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : 100,
    pageId: text(p.pageId),
    siteId: text(p.siteId),
    mark: text(p.mark),
    language: text(p.language),
    clusterId: p.clusterId === null ? null : text(p.clusterId),
    type: choice(Object.values(PageType), p.type),
    status: choice(Object.values(PageStatus), p.status),
    title: text(p.title),
    h1: p.h1 === null ? null : text(p.h1),
    metaTitle: p.metaTitle === null ? null : text(p.metaTitle),
    metaDescription: p.metaDescription === null ? null : text(p.metaDescription),
    ogTitle: p.ogTitle == null ? null : text(p.ogTitle),
    ogDescription: p.ogDescription == null ? null : text(p.ogDescription),
    ogImage: p.ogImage == null ? null : text(p.ogImage),
    ogType: p.ogType == null ? null : choice(Object.values(OpenGraphType), p.ogType),
    mimeType: p.mimeType === undefined ? 'text/html' : text(p.mimeType),
    excludeFromSitemap: p.excludeFromSitemap === undefined ? false : flag(p.excludeFromSitemap),
    systemDocument: p.systemDocument == null ? null : choice(Object.values(SystemDocument), p.systemDocument),
    contentMd: text(p.contentMd),
    ...(p.tvValues === undefined ? {} : { tvValues: object(p.tvValues) }),
    ...(p.authoredTvValues === undefined ? {} : { authoredTvValues: object(p.authoredTvValues) }),
    robotsIndex: flag(p.robotsIndex),
    createdAt: instant(p.createdAt),
    updatedAt: instant(p.updatedAt),
    publishedAt: p.publishedAt === null ? null : instant(p.publishedAt),
    ...(p.rendering === undefined ? {} : { rendering: rendering(p.rendering) }),
  });

  if (page.status !== PageStatus.PUBLISHED) {
    throw new PublicationConsistencyError('Stored plan contains a draft');
  }

  return page;
}

import { SnippetExecution } from '../../../../domain/rendering/snippet.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { validatePreparedInlineStyles } from '../../rendering/html/inline-style-hashes.js';

export function decodePlan(value: unknown): { plan: IRenderPlan; assets: ICompiledPageAssets } {
  const raw = object(value);
  const page = decodePublishedPage(raw.page);
  const templates = list(raw.templates).map((value): ITemplateSource => {
    const item = object(value);

    return {
      id: text(item.id),
      revision: text(item.revision),
      kind: choice(Object.values(TemplateSourceKind), item.kind),
      html: text(item.html),
      parameters: contracts(item.parameters),
      ...(item.snippet === undefined ? {} : { snippet: parseSnippetSource(item.snippet, true) }),
      ...(item.frontendSourceId === undefined ? {} : { frontendSourceId: text(item.frontendSourceId) }),
      ...(item.name === undefined ? {} : { name: text(item.name) }),
    };
  });
  const assets = object(raw.assets);
  const inlineStyles = assets.inlineStyles === undefined ? undefined : list(assets.inlineStyles).map((entry) => {
    const style = object(entry);

    return { content: text(style.content), hash: text(style.hash) };
  });

  if (inlineStyles) {
    validatePreparedInlineStyles(inlineStyles);
  }

  const publishedPages = list(raw.publishedPages ?? []).map((value) => {
    const item = object(value);

    return {
      siteId: text(item.siteId),
      pageId: text(item.pageId),
      ...(item.pageNumber === undefined ? {} : { pageNumber: item.pageNumber === null ? null : text(item.pageNumber) }),
      urlId: text(item.urlId),
      parentUrlId: item.parentUrlId === null ? null : text(item.parentUrlId),
      title: text(item.title),
      language: text(item.language),
      path: text(item.path),
      ...(item.tvValues === undefined ? {} : { tvValues: object(item.tvValues) }),
      ...(item.tv === undefined ? {} : { tv: object(item.tv) }),
    };
  });

  validatePublishedPages(text(raw.siteId), publishedPages);

  return {
    assets: { head: text(assets.head), body: text(assets.body), ...(inlineStyles ? { inlineStyles } : {}) },
    plan: {
      ...(raw.preparedMarkdown === undefined ? {} : {
        preparedMarkdown: (() => {
          const prepared = object(raw.preparedMarkdown);

          requireCondition(typeof prepared.trusted === 'boolean', 'Invalid prepared Markdown trust');

          return {
            source: prepared.source === null ? null : text(prepared.source),
            trusted: prepared.trusted === true,
            html: text(prepared.html),
          };
        })(),
      }),
      ...(raw.snippetCachePolicies === undefined ? {} : {
        snippetCachePolicies: Object.fromEntries(Object.entries(object(raw.snippetCachePolicies))
          .map(([id, policy]) => [id, parseSnippetCachePolicy(policy)])),
      }),
      ...(raw.snippetExecutions === undefined ? {} : {
        snippetExecutions: Object.fromEntries(Object.entries(object(raw.snippetExecutions))
          .map(([id, mode]) => [id, choice(Object.values(SnippetExecution), mode)])),
      }),
      ...(raw.templateValues === undefined ? {} : { templateValues: object(raw.templateValues) }),
      ...(raw.jsonLd === undefined ? {} : { jsonLd: decodeJsonLdContext(raw.jsonLd, text(raw.siteId)) }),
      publishedPages,
      planId: text(raw.planId),
      siteId: text(raw.siteId),
      pageId: text(raw.pageId),
      page: page.toState(),
      rendering: rendering(raw.rendering),
      settings: object(raw.settings),
      requestParameters: contracts(raw.requestParameters),
      buildValues: object(raw.buildValues),
      templates,
      loaders: list(raw.loaders).map(binding),
      frontendSourceIds: list(raw.frontendSourceIds).map(text),
    },
  };
}
