import type { IncomingMessage, ServerResponse } from 'node:http';

import { HookKind, hookRequirement, validateHookObject } from '../../../../domain/hooks/hook.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IHookConfigurationOperations } from '../../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IGetHookHistory, IRetryHookDelivery, ISkipHookDelivery } from
  '../../../../ports/inbound/hooks/hook-execution.port.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson } from
  '../shared/admin-http.boundary.js';

function string(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100000) {
    throw new HttpFailure(400, 'Invalid string');
  }

  return value;
}

export class AdminHooksController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly operations: IHookConfigurationOperations, private readonly history: IGetHookHistory,
    private readonly retry: IRetryHookDelivery, private readonly skip: ISkipHookDelivery) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/hooks(?:\/|$)/.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const match = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/hooks(?:\/(handlers|subscriptions|history)(?:\/([A-Za-z0-9_-]{1,128}))?(?:\/(draft|apply|enabled|reorder|retry|skip))?)?$/.exec(target);

      if (!match) {
        throw new HttpFailure(400, 'Invalid hooks route');
      }

      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const actor = { siteId: match[1]!, actorId: user.adminUserId };

      if (request.method === 'GET') {
        if (match[4]) {
          throw new HttpFailure(405, 'POST required');
        }
        if (!match[2]) {
          const tree = await this.operations.list.execute(actor);

          sendJson(response, 200, {
            ...tree,
            handlers: tree.handlers.map((handler) => ({
              handlerId: handler.handlerId,
              title: handler.title,
              kind: handler.kind,
              enabled: handler.enabled,
              activeVersionId: handler.activeVersionId,
              version: handler.version,
            })),
          });
        } else if (match[2] === 'handlers' && match[3]) {
          sendJson(response, 200, await this.operations.get.execute({ ...actor, handlerId: match[3] }));
        } else if (match[2] === 'history' && !match[3]) {
          sendJson(response, 200, { items: await this.history.execute(actor), window: 200 });
        } else {
          throw new HttpFailure(404, 'Unknown hooks operation');
        }

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request, 2097152);
      const action = match[4] ?? match[3];
      const allowed = match[2] === 'handlers' && action === 'create' ? ['title', 'kind', 'draft']
        : action === 'draft' ? ['title', 'draft', 'expectedVersion'] : action === 'apply' ? ['expectedVersion']
          : action === 'enabled' ? ['enabled', 'expectedVersion'] : match[2] === 'subscriptions' && action === 'save'
            ? ['subscription', 'expectedVersion'] : action === 'reorder' ? ['hookKey', 'ordered']
              : action === 'skip' ? ['version', 'reason'] : ['version'];

      if (Object.keys(body).some((key) => !allowed.includes(key))) {
        throw new HttpFailure(400, 'Unknown command field');
      }
      if (match[2] === 'handlers' && action === 'create') {
        hookRequirement(body.kind === HookKind.Check || body.kind === HookKind.Event, 'Invalid handler kind');
        validateHookObject(body.draft, 2097152);
        hookRequirement(typeof body.draft.source === 'string' && Array.isArray(body.draft.capabilities)
          && body.draft.capabilities.every((item) => typeof item === 'string')
          && Object.keys(body.draft).every((key) => ['source', 'capabilities'].includes(key)), 'Invalid draft');
        sendJson(response, 201, await this.operations.create.execute({
          ...actor,
          title: string(body.title),
          kind: body.kind,
          draft: { source: body.draft.source, capabilities: body.draft.capabilities.map(string) },
        }));
      } else if (match[2] === 'handlers' && match[3]) {
        const input = { ...actor, handlerId: match[3], expectedVersion: string(body.expectedVersion) };

        if (action === 'apply') {
          sendJson(response, 200, await this.operations.apply.execute(input));
        } else if (action === 'enabled') {
          hookRequirement(typeof body.enabled === 'boolean', 'Invalid enabled flag');
          sendJson(response, 200, await this.operations.setEnabled.execute({ ...input, enabled: body.enabled }));
        } else if (action === 'draft') {
          validateHookObject(body.draft, 2097152);
          hookRequirement(typeof body.draft.source === 'string' && Array.isArray(body.draft.capabilities)
            && body.draft.capabilities.every((item) => typeof item === 'string')
            && Object.keys(body.draft).every((key) => ['source', 'capabilities'].includes(key)), 'Invalid draft');
          sendJson(response, 200, await this.operations.update.execute({
            ...input,
            title: string(body.title),
            draft: { source: body.draft.source, capabilities: body.draft.capabilities.map(string) },
          }));
        } else {
          throw new HttpFailure(404, 'Unknown handler action');
        }
      } else if (match[2] === 'subscriptions' && action === 'save') {
        validateHookObject(body.subscription);
        const value = body.subscription;

        hookRequirement(Object.keys(value).every((key) => ['subscriptionId', 'hookKey', 'schemaVersion',
          'kind', 'title',
          'handlerId', 'addonKey', 'handlerKey', 'ownerKind', 'configuration', 'filters', 'enabled', 'priority',
          'retrySafe', 'deliveryMode', 'manifestKey'].includes(key)), 'Invalid subscription fields');
        validateHookObject(value.configuration);
        validateHookObject(value.filters);
        hookRequirement(value.schemaVersion === 1 && typeof value.priority === 'number'
          && typeof value.enabled === 'boolean' && typeof value.retrySafe === 'boolean'
          && (value.kind === HookKind.Check || value.kind === HookKind.Event)
          && (value.deliveryMode === 'Event' || value.deliveryMode === 'Detail'), 'Invalid binding values');
        sendJson(response, 200, await this.operations.subscribe.execute({
          ...actor,
          expectedVersion: body.expectedVersion === null ? null : string(body.expectedVersion),
          subscription: {
            subscriptionId: string(value.subscriptionId),
            hookKey: string(value.hookKey),
            schemaVersion: value.schemaVersion,
            kind: value.kind,
            title: string(value.title),
            handlerId: string(value.handlerId),
            addonKey: null,
            handlerKey: null,
            ownerKind: 'User',
            configuration: value.configuration,
            filters: value.filters,
            enabled: value.enabled,
            priority: value.priority,
            retrySafe: value.retrySafe,
            deliveryMode: value.deliveryMode,
            manifestKey: null,
          },
        }));
      } else if (match[2] === 'subscriptions' && action === 'reorder') {
        hookRequirement(Array.isArray(body.ordered) && body.ordered.length <= 128, 'Invalid ordering');
        const ordered = body.ordered.map((item: unknown) => {
          validateHookObject(item);

          return { id: string(item.id), version: string(item.version) };
        });

        await this.operations.reorder.execute({ ...actor, hookKey: string(body.hookKey), ordered });
        sendJson(response, 200, { reordered: true });
      } else if (match[2] === 'history' && match[3] && (action === 'retry' || action === 'skip')) {
        const input = { ...actor, deliveryId: match[3], version: string(body.version) };

        if (action === 'retry') {
          await this.retry.execute(input);
        } else {
          await this.skip.execute({ ...input, reason: string(body.reason) });
        }
        sendJson(response, 200, { accepted: true });
      } else {
        throw new HttpFailure(404, 'Unknown hooks operation');
      }
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
