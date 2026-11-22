import { Page } from '../../../../../domain/pages/page.js';
import type { ITemplateObject, TemplateValue } from '../../../../../domain/pages/page-rendering.js';
import type { IPageRecord } from './page.schema.js';

function readValue(value: unknown): TemplateValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number'
    && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return Array.from(value, readValue);
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, readValue(entry)]));
  }
  throw new Error('Stored rendering parameters must contain JSON values');
}

function readParameters(parameters: Record<string, unknown>): ITemplateObject {
  return Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, readValue(value)]));
}

export function toPage(record: IPageRecord): Page {
  return new Page({
    pageId: record._id,
    mimeType: record.mimeType ?? 'text/html',
    excludeFromSitemap: record.excludeFromSitemap ?? false,
    systemDocument: record.systemDocument ?? null,
    pageNumber: record.pageNumber ?? null,
    parentPageId: record.parentPageId ?? null,
    sortOrder: record.sortOrder ?? 100,
    siteId: record.siteId,
    mark: record.mark,
    language: record.language,
    clusterId: record.clusterId,
    type: record.type,
    status: record.status,
    title: record.title,
    h1: record.h1,
    metaTitle: record.metaTitle,
    metaDescription: record.metaDescription,
    ogTitle: record.ogTitle ?? null,
    ogDescription: record.ogDescription ?? null,
    ogImage: record.ogImage ?? null,
    ogType: record.ogType ?? null,
    contentMd: record.contentMd,
    ...(record.tvValues === undefined ? {} : { tvValues: readParameters(record.tvValues) }),
    robotsIndex: record.robotsIndex,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.rendering === undefined ? {} : {
      rendering: {
        ...(record.rendering.requestCache === undefined ? {} : { requestCache: record.rendering.requestCache }),
        templateId: record.rendering.templateId,
        delivery: record.rendering.delivery,
        interaction: record.rendering.interaction,
        parameters: readParameters(record.rendering.parameters),
        loaders: Array.from(record.rendering.loaders, (loader) => ({
          loaderId: loader.loaderId,
          alias: loader.alias,
          phase: loader.phase,
          parameters: readParameters(loader.parameters),
          dependsOn: Array.from(loader.dependsOn),
          required: loader.required,
        })),
      },
    }),
  });
}

