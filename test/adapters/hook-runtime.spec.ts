import { HookAddonRegistry } from '../../src/adapters/outbound/runtime/hooks/hook-addon-registry.js';
import { HookCompilerAdapter, HookScriptRuntime } from
  '../../src/adapters/outbound/runtime/hooks/hook-script.adapter.js';
import { HookKind } from '../../src/domain/hooks/hook.js';

describe('hook script boundary', () => {
  it('executes a code-owned CMS hook through the granted query bridge', async () => {
    const registry = new HookAddonRegistry();

    await registry.register('synthetic', 'artifact', {
      version: 1,
      definitions: [],
      handlers: [{
        key: 'page-check',
        title: 'Synthetic check',
        hookKey: 'cms.page.create.check',
        kind: HookKind.Check,
        priority: 0,
        retrySafe: false,
        source: `const page = await context.query("cms.page.get", {pageId: input.pageId});
          return {allow: page.exists};`,
        capabilities: ['query.cms.page.get'],
      }],
    });
    const query = vi.fn(async () => ({ exists: true }));
    const runtime = new HookScriptRuntime(async (recipient) => registry.artifact(recipient), query);
    const recipient = {
      subscriptionId: 'native',
      consumerId: 'native-handler',
      hookKey: 'cms.page.create.check',
      kind: HookKind.Check,
      priority: 0,
      versionId: 'synthetic:artifact:page-check',
      addonKey: 'synthetic',
      configuration: {},
      capabilities: ['query.cms.page.get'],
      retrySafe: false,
      deliveryMode: 'Event' as const,
    };
    const invocation = {
      siteId: 'site-a',
      actorId: 'admin',
      hookKey: recipient.hookKey,
      input: { pageId: 'page-a' },
      configuration: {},
      capabilities: recipient.capabilities,
    };

    expect(await runtime.evaluate(recipient, invocation)).toEqual({ allow: true });
    expect(query).toHaveBeenCalledWith(invocation, 'cms.page.get', { pageId: 'page-a' }, expect.any(AbortSignal));
  });

  it.each([
    { lateFailure: false, cooperative: false },
    { lateFailure: true, cooperative: false },
    { lateFailure: false, cooperative: true },
  ])('settles admitted queries (late failure: $lateFailure, cooperative cancellation: $cooperative)',
    async ({ lateFailure, cooperative }) => {
      const artifact = await new HookCompilerAdapter().compile(
        'void context.query("cms.page.get", {}); return {allow: true};',
      );
      let started!: () => void;
      let release!: () => void;
      let cancelled = false;
      let queryFinished = false;
      const lateError = new Error('Synthetic late query failure');
      const entered = new Promise<void>(resolve => {
        started = resolve;
      });
      const query = vi.fn((_invocation: unknown, _name: string, _input: unknown, signal?: AbortSignal) =>
        new Promise<Record<string, never>>((resolve, reject) => {
          release = () => {
            queryFinished = true;

            if (lateFailure) {
              reject(lateError);
            } else {
              resolve({});
            }
          };
          signal?.addEventListener('abort', () => {
            cancelled = true;

            if (cooperative) {
              queryFinished = true;
              reject(signal.reason);
            }
          }, { once: true });
          started();
        }));
      const runtime = new HookScriptRuntime(async () => ({ ...artifact, capabilities: ['query.cms.page.get'] }), query);
      const recipient = {
        subscriptionId: 'sub',
        consumerId: 'handler',
        hookKey: 'cms.page.create.check',
        kind: HookKind.Check,
        priority: 0,
        versionId: 'frozen',
        addonKey: null,
        configuration: {},
        capabilities: ['query.cms.page.get'],
        retrySafe: false,
        deliveryMode: 'Event' as const,
      };
      let settled = false;
      const outcome = runtime.evaluate(recipient, {
        siteId: 'site',
        actorId: 'admin',
        hookKey: recipient.hookKey,
        input: {},
        configuration: {},
        capabilities: recipient.capabilities,
      }).then(result => {
        settled = true;

        return result;
      }, error => {
        settled = true;
        throw error;
      });

      try {
        await entered;

        if (cooperative) {
          await expect(outcome).resolves.toEqual({ allow: true });
          expect(cancelled).toBe(true);
          expect(queryFinished).toBe(true);

          return;
        }
        await expect.poll(() => cancelled || settled).toBe(true);
        expect(settled).toBe(false);
        expect(cancelled).toBe(true);
        expect(queryFinished).toBe(false);
        release();

        if (lateFailure) {
          await expect(outcome).rejects.toBe(lateError);
        } else {
          await expect(outcome).resolves.toEqual({ allow: true });
        }
        expect(queryFinished).toBe(true);
      } finally {
        release?.();
        await Promise.allSettled([outcome]);
      }
    });

  it('compiles trusted source and executes with scoped JSON without process or filesystem access', async () => {
    const compiler = new HookCompilerAdapter();
    const compiled = await
    compiler.compile('return {allow: typeof process === "undefined" && input.pageId === "page-a"};');
    const runtime = new HookScriptRuntime(async () => ({ ...compiled, capabilities: [] }), async () => {
      throw new Error('No query permitted');
    });
    const result = await runtime.evaluate({
      subscriptionId: 'sub',
      consumerId: 'handler',
      hookKey: 'cms.page.archive.check',
      kind: HookKind.Check,
      priority: 0,
      versionId: 'frozen',
      addonKey: null,
      configuration: {},
      capabilities: [],
      retrySafe: false,
      deliveryMode: 'Event',
    }, {
      siteId: 'site-a',
      hookKey: 'cms.page.archive.check',
      actorId: 'admin',
      input: { pageId: 'page-a' },
      configuration: {},
      capabilities: [],
    });

    expect(result).toEqual({ allow: true });
    await expect(compiler.compile('return { invalid: ;')).rejects.toThrow();
    await expect(compiler.compile('return await import("node:fs");')).rejects.toThrow();
    const escape = await
    compiler.compile('return {allow: Boolean((globalThis as any).__query.constructor("return process")())};');

    await expect(new HookScriptRuntime(async () => ({ ...escape, capabilities: [] }), async () => ({})).evaluate({
      subscriptionId: 'sub',
      consumerId: 'handler',
      hookKey: 'cms.page.archive.check',
      kind: HookKind.Check,
      priority: 0,
      versionId: 'frozen',
      addonKey: null,
      configuration: {},
      capabilities: [],
      retrySafe: false,
      deliveryMode: 'Event',
    }, {
      siteId: 'site-a',
      hookKey: 'cms.page.archive.check',
      actorId: 'admin',
      input: {},
      configuration: {},
      capabilities: [],
    }))
      .rejects.toThrow();
  });
});
