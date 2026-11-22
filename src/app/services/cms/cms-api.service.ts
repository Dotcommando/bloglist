import type { ICmsApi } from '@zarya/addon-contracts/cms';

import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { CmsApi, ICmsList } from '../../../ports/inbound/cms/cms-api.port.js';
import type { ICmsContext, ICmsOperationsPort } from '../../../ports/outbound/cms/cms-operations.port.js';
import type { CmsExtensionRegistryService } from './cms-extension-registry.service.js';
import { isCmsRead } from './cms-read.policy.js';

interface ICmsObject { readonly [key: string]: unknown; }

interface ICmsOperation { execute(input: ICmsObject): Promise<unknown>; }

interface ICmsListSelection {
  readonly limit: number;
  readonly offset: number;
  readonly filter: ICmsObject;
  readonly sorting: readonly { readonly field: string; readonly direction: string }[];
  readonly identity: string;
}

const listFields: Readonly<Record<string, readonly string[]>> = {
  pages: [
    'pageId', 'parentPageId', 'pageNumber', 'sortOrder', 'mark', 'title', 'language',
    'type', 'status', 'clusterId', 'createdAt', 'updatedAt', 'publishedAt',
  ],
  sites: ['siteId', 'mark', 'name', 'primaryDomain', 'status', 'createdAt', 'updatedAt'],
  templates: ['key', 'name', 'version', 'createdAt', 'updatedAt'],
  chunks: ['key', 'name', 'version', 'createdAt', 'updatedAt'],
  snippets: ['key', 'name', 'version', 'createdAt', 'updatedAt'],
  tvs: ['name', 'caption', 'kind', 'required', 'sortOrder'],
  files: ['fileId', 'folderId', 'name', 'mode', 'mimeType', 'byteSize'],
  addons: ['addonKey', 'status'],
  hooks: ['hookKey', 'kind', 'provider', 'registeredAt', 'available'],
  adminUsers: ['adminUserId', 'email', 'blocked', 'createdAt', 'updatedAt'],
  urls: ['urlId', 'path', 'createdAt', 'reason'],
};

const identities: Readonly<Record<string, string>> = {
  pages: 'pageId',
  sites: 'siteId',
  templates: 'key',
  chunks: 'key',
  snippets: 'key',
  tvs: 'name',
  files: 'fileId',
  addons: 'addonKey',
  hooks: 'hookKey',
  adminUsers: 'adminUserId',
  urls: 'urlId',
};

const listMethods = new Set(['list', 'listVersions', 'getHistory', 'history']);

const reserved = new Set(['__proto__', 'constructor', 'prototype', 'siteId', 'actorId', 'signal']);

function invalid(message: string): never {
  throw new BusinessError(BusinessErrorCode.Validation, message);
}

export function isCmsObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!isCmsObject(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return invalid('Expected an object');
  }

  return value;
}

function isOperation(value: unknown): value is ICmsOperation {
  return isCmsObject(value) && typeof value.execute === 'function';
}

function isCmsApi(value: unknown): value is CmsApi & ICmsApi {
  return isCmsObject(value) && isCmsObject(value.extensions)
    && Object.entries(value).every(([key, methods]) => key === 'extensions'
      || isCmsObject(methods) && Object.values(methods).every((method) => typeof method === 'function'));
}

function isByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
  return value !== null && typeof value === 'object' && Symbol.asyncIterator in value
    && typeof value[Symbol.asyncIterator] === 'function';
}

function isByteArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((byte: unknown) =>
    typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

/** Converts application entities to detached data; no mutable entity crosses the extension boundary. */
export async function cmsData(value: unknown): Promise<unknown> {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return invalid('Non-finite CMS result');
    }

    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(cmsData));
  }
  if (!isCmsObject(value)) {
    return invalid('Unsupported CMS result');
  }
  if ('toState' in value && typeof value.toState === 'function') {
    return cmsData(value.toState());
  }
  if (isByteStream(value)) {
    const output: number[] = [];

    for await (const chunk of value) {
      if (!(chunk instanceof Uint8Array)) {
        return invalid('Invalid CMS byte stream');
      }

      for (const byte of chunk) {
        output.push(byte);
      }
    }

    return output;
  }

  return Object.fromEntries(await Promise.all(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(async ([key, item]) => [key, await cmsData(item)])));
}

export class CmsApiService {
  constructor(private readonly operations: ICmsOperationsPort,
    private readonly extensions?: CmsExtensionRegistryService) {}

  forContext(context: ICmsContext, before?: () => Promise<void>): CmsApi & ICmsApi {
    const captured = Object.freeze({ ...context });
    const operations = this.operations.forContext(captured);
    const api: unknown = {
      ...Object.fromEntries(Object.entries(operations).map(([group, methods]) => [
        group, Object.freeze(Object.fromEntries(Object.keys(methods).map((method) => [
          method, async (input: unknown = {}) => {
            await before?.();

            return this.invoke(captured, group, method, input);
          },
        ]))),
      ])),
      extensions: {},
    };

    if (!isCmsApi(api)) {
      throw new Error('Invalid CMS operation composition');
    }
    Object.defineProperty(api, 'extensions', {
      value: this.extensions?.forContext(captured, api, before) ?? Object.freeze({}),
      enumerable: true,
    });

    return Object.freeze(api);
  }

  async invoke(context: ICmsContext, group: string, method: string, value: unknown): Promise<unknown> {
    if (context.readOnly && !isCmsRead(group, method)) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Commands are unavailable in parallel Snippet reads');
    }

    const input = inputObject(value);

    if (!context.siteId.trim() || !context.actorId.trim()) {
      invalid('Trusted CMS context is required');
    }
    if (Object.keys(input).some((key) => reserved.has(key))) {
      invalid('CMS identity and cancellation are host-owned');
    }
    if (['templates', 'chunks', 'snippets'].includes(group) && Object.hasOwn(input, 'kind')) {
      invalid('Element kind is selected by its API group');
    }

    const groups = this.operations.forContext(context);
    const methods: unknown = Object.getOwnPropertyDescriptor(groups, group)?.value;

    if (!isCmsObject(methods) || !Object.hasOwn(methods, method)) {
      invalid('Unknown CMS operation');
    }

    const operation = methods[method];

    if (!isOperation(operation)) {
      invalid('Unknown CMS operation');
    }

    const list = listMethods.has(method);
    const pagination = list ? this.listInput(group, method, input) : null;
    const arguments_ = { ...input };

    if (list) {
      for (const key of ['limit', 'offset', 'sortby', 'filter', 'parentId']) {
        delete arguments_[key];
      }
    }
    if (group === 'tvs' && method === 'savePage' && typeof arguments_.expectedUpdatedAt === 'string') {
      arguments_.expectedUpdatedAt = new Date(arguments_.expectedUpdatedAt);
    }
    if (arguments_.content !== undefined) {
      const content = inputObject(arguments_.content);
      const bytes = content.bytes;

      if (!isByteArray(bytes)) {
        invalid('Content bytes must be an array of byte values');
      }
      arguments_.content = {
        ...content,
        bytes: (async function* () {
          yield Uint8Array.from(bytes);
        })(),
      };
    }

    const result = await cmsData(await operation.execute({
      ...arguments_, siteId: context.siteId, actorId: context.actorId,
    }));

    return pagination ? this.paginate(group, result, pagination) : result;
  }

  private listInput(group: string, method: string, input: ICmsObject): ICmsListSelection {
    const allowed = [
      'limit', 'offset', 'sortby', 'filter',
      ...(group === 'pages' && method === 'list' ? ['parentId'] : []),
      ...(group === 'adminUsers' && method === 'list' ? ['status'] : []),
      ...(method === 'getHistory' ? ['urlId'] : []),
      ...(method === 'listVersions' ? ['pageId'] : []),
    ];

    if (Object.keys(input).some((key) => !allowed.includes(key))) {
      invalid('Unsupported list argument');
    }

    const limit = input.limit === undefined ? 50 : input.limit;
    const offset = input.offset === undefined ? 0 : input.offset;

    if (
      typeof limit !== 'number'
      || !Number.isSafeInteger(limit)
      || limit < 1
      || typeof offset !== 'number'
      || !Number.isSafeInteger(offset)
      || offset < 0
    ) {
      invalid('Invalid list limit or offset');
    }

    const fields = method === 'listVersions' ? ['pageVersionId']
      : method === 'history' ? ['deliveryId', 'state', 'attempts']
        : method === 'getHistory' ? [
          'urlHistoryEntryId', 'urlId', 'kind', 'pageId', 'redirectTargetUrlId', 'redirectStatus', 'createdAt',
        ] : listFields[group] ?? [];
    const filter = input.filter === undefined ? {} : { ...inputObject(input.filter) };

    if (
      Object.entries(filter).some(([key, value]) => !fields.includes(key)
      || value !== null && !['string', 'number', 'boolean'].includes(typeof value)
      || typeof value === 'number' && !Number.isFinite(value))
    ) {
      invalid('Unsupported list filter');
    }
    if (Object.hasOwn(input, 'parentId')) {
      if (input.parentId !== null && typeof input.parentId !== 'string') {
        invalid('Invalid parentId');
      }
      filter.parentPageId = input.parentId;
    }

    const sortby = input.sortby === undefined ? [] : input.sortby;

    if (!Array.isArray(sortby)) {
      invalid('Invalid sortby');
    }

    const sorting = sortby.map((item: unknown) => {
      const sort = inputObject(item);
      const field = sort.field;
      const direction = sort.direction;

      if (
        Object.keys(sort).some((key) => !['field', 'direction'].includes(key))
        || typeof field !== 'string'
        || !fields.includes(field)
        || typeof direction !== 'string'
        || !['asc', 'desc'].includes(direction)
      ) {
        invalid('Unsupported list sort');
      }

      return { field, direction };
    });

    return {
      limit,
      offset,
      filter,
      sorting,
      identity: method === 'listVersions' ? 'pageVersionId'
        : method === 'history' ? 'deliveryId'
          : method === 'getHistory' ? 'urlHistoryEntryId' : identities[group] ?? 'id',
    };
  }

  private paginate(group: string, result: unknown, input: ICmsListSelection): ICmsList<ICmsObject> {
    const envelope = Array.isArray(result) ? null : inputObject(result);
    const values = Array.isArray(result) ? result
      : envelope!.items ?? envelope!.fields ?? envelope!.files ?? envelope!.hooks;

    if (!Array.isArray(values)) {
      invalid('CMS list result has no items');
    }

    const field = (item: ICmsObject, name: string): unknown => {
      if (Object.hasOwn(item, name)) {
        return item[name];
      }
      if (group === 'addons') {
        if (name === 'addonKey') {
          return isCmsObject(item.definition) ? item.definition.addonKey
            : isCmsObject(item.connection) ? item.connection.addonKey : undefined;
        }
        if (name === 'status' && isCmsObject(item.connection)) {
          return item.connection.status;
        }
      }

      return undefined;
    };
    const compare = (a: unknown, b: unknown): number => a === b ? 0 : a === undefined ? -1 : b === undefined ? 1
      : a === null ? -1 : b === null ? 1
        : typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1;
    const items = values.map((item: unknown) => inputObject(item)).filter((item) =>
      Object.entries(input.filter).every(([key, value]) => field(item, key) === value));

    items.sort((a, b) => {
      for (const sort of [...input.sorting, { field: input.identity, direction: 'asc' }]) {
        const result = compare(field(a, sort.field), field(b, sort.field));

        if (result) {
          return sort.direction === 'desc' ? -result : result;
        }
      }

      return 0;
    });
    const metadata = envelope ? Object.fromEntries(Object.entries(envelope).filter(([key]) =>
      !['items', 'fields', 'files', 'hooks', 'nextCursor'].includes(key))) : {};

    return {
      items: items.slice(input.offset, input.offset + input.limit),
      total: items.length,
      limit: input.limit,
      offset: input.offset,
      ...(Object.keys(metadata).length ? { metadata } : {}),
    };
  }
}
