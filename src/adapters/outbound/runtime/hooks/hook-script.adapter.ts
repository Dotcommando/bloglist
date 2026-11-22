import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

import type { IAddonObject } from '@zarya/addon-contracts/addons';
import ts from 'typescript';

import { HookKind, hookRequirement, type IHookEvaluation, type IHookInvocation, validateHookObject } from
  '../../../../domain/hooks/hook.js';
import type { IHookRecipient } from '../../../../domain/hooks/hook-execution.js';
import type { IHookCompilerPort } from '../../../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookRuntimePort } from '../../../../ports/outbound/hooks/hook-execution.port.js';

const runner = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const sandbox = Object.create(null);
sandbox.__data = JSON.stringify(workerData.invocation);
const context = vm.createContext(sandbox, {codeGeneration: {strings: false, wasm: false}});
const bootstrap = 'globalThis.__result = null; globalThis.__failed = false; globalThis.__outgoing = []; '
  + 'globalThis.__waiting = new Map(); let __queryId = 0; '
  + '(async () => { const context = JSON.parse(__data); const input = context.input; '
  + 'context.query = (name, input) => new Promise((resolve, reject) => { const id = ++__queryId; '
  + '__waiting.set(id, {resolve, reject}); __outgoing.push(JSON.stringify({query: name, input, id})); }); '
  + workerData.code + '; return JSON.stringify(await __hook(input, context)); })()'
  + '.then(value => {__result = value;}, () => {__failed = true;});';
try { vm.runInContext(bootstrap, context, {timeout: 1000}); }
catch { parentPort.postMessage({failed: true}); }
parentPort.on('message', message => {
  sandbox.__reply = JSON.stringify(message);
  try { vm.runInContext('(() => { const message = JSON.parse(__reply); const pending = __waiting.get(message.id); '
    + 'if (pending) { __waiting.delete(message.id); message.failed ? pending.reject(new Error("Query unavailable")) : pending.resolve(message.value); } })()',
    context, {timeout: 1000}); }
  catch { parentPort.postMessage({failed: true}); }
});
setInterval(() => {
  try {
    const state =
      JSON.parse(vm.runInContext('JSON.stringify({result: __result, failed: __failed, outgoing: __outgoing.splice(0)})', context, {timeout: 1000}));
    for (const value of state.outgoing) parentPort.postMessage(JSON.parse(value));
    if (state.failed) parentPort.postMessage({failed: true});
    if (state.result !== null) {
      if (typeof state.result !== 'string' || Buffer.byteLength(state.result) > 2097152)
        throw new Error('Invalid result');
      parentPort.postMessage({result: state.result});
    }
  } catch { parentPort.postMessage({failed: true}); }
}, 5);
`;

export class HookCompilerAdapter implements IHookCompilerPort {
  async compile(source: string): ReturnType<IHookCompilerPort['compile']> {
    const tree = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true);
    let forbidden = false;
    const inspect = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node)
        || ts.isExportDeclaration(node)
        || ts.isCallExpression(node)
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || ts.isIdentifier(node.expression)
        && ['require', 'eval'].includes(node.expression.text))
      ) {
        forbidden = true;
      }
      ts.forEachChild(node, inspect);
    };

    inspect(tree);
    const result = ts.transpileModule('async function __hook(input: any, context: any) {\n' + source + '\n}', {
      reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });

    hookRequirement(!forbidden && !result.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error),
      'Invalid handler TypeScript or forbidden import');

    return {
      compiledJavaScript: result.outputText,
      digest: createHash('sha256').update(result.outputText).digest('hex'),
    };
  }
}

export class HookScriptRuntime implements IHookRuntimePort {
  constructor(private readonly resolve: (recipient: IHookRecipient, siteId: string | null) => Promise<{
    readonly compiledJavaScript: string; readonly digest: string; readonly capabilities: readonly string[];
  }>, private readonly query: (invocation: IHookInvocation, name: string, input: IAddonObject,
    signal: AbortSignal) => Promise<IAddonObject>,
  ) {}

  async evaluate(recipient: IHookRecipient, invocation: IHookInvocation): Promise<IHookEvaluation> {
    const artifact = await this.resolve(recipient, invocation.siteId);

    hookRequirement(createHash('sha256').update(artifact.compiledJavaScript).digest('hex') === artifact.digest,
      'Hook artifact integrity mismatch');

    return new Promise((resolve, reject) => {
      const worker = new Worker(runner, {
        eval: true,
        execArgv: [],
        env: {},
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        workerData: { code: artifact.compiledJavaScript, invocation },
      });
      let settled = false;
      let queryCount = 0;
      const controller = new AbortController();
      const queries: Promise<void>[] = [];
      const finish = (result?: string, cause?: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        controller.abort();
        const failures: unknown[] = [];
        let evaluation: IHookEvaluation | undefined;

        try {
          if (result === undefined) {
            throw cause ?? new Error('Hook execution failed');
          }

          const value: unknown = JSON.parse(result);

          validateHookObject(value, 2097152);
          hookRequirement(value.allow === undefined || typeof value.allow === 'boolean', 'Invalid check result');
          hookRequirement(value.reason === undefined || typeof value.reason === 'string', 'Invalid check reason');
          hookRequirement(value.commands === undefined || Array.isArray(value.commands), 'Invalid command plan');
          const commands = Array.isArray(value.commands) ? value.commands.map((item: unknown) => {
            validateHookObject(item);
            hookRequirement(typeof item.key === 'string' && typeof item.name === 'string', 'Invalid command identity');
            validateHookObject(item.arguments);

            return { key: item.key, name: item.name, arguments: item.arguments };
          }) : undefined;

          evaluation = {
            ...(typeof value.allow === 'boolean' ? { allow: value.allow } : {}),
            ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
            ...(commands ? { commands } : {}),
          };
        } catch (error) {
          failures.push(error);
        }
        void Promise.allSettled([
          Promise.resolve().then(() => worker.terminate()),
          ...queries,
        ]).then(outcomes => {
          for (const outcome of outcomes) {
            if (outcome.status === 'rejected') {
              failures.push(outcome.reason);
            }
          }

          if (failures.length === 1) {
            reject(failures[0]);
          } else if (failures.length) {
            reject(new AggregateError(failures, 'Hook evaluation and cleanup failed'));
          } else if (evaluation) {
            resolve(evaluation);
          } else {
            reject(new Error('Hook evaluation has no result'));
          }
        }, reject);
      };
      const timer = setTimeout(() => finish(), recipient.kind === HookKind.Check ? 1000 : 10000);

      worker.on('message', (message: { result?: string;
        failed?: boolean;
        query?: string;
        input?: unknown;
        id?: number }) => {
        if (settled) {
          return;
        }
        if (message.query) {
          if (++queryCount > 32) {
            finish();

            return;
          }

          const name = message.query;

          if (!recipient.capabilities.includes('query.' + name)) {
            worker.postMessage({ id: message.id, failed: true });

            return;
          }

          try {
            validateHookObject(message.input);
          } catch {
            worker.postMessage({ id: message.id, failed: true });

            return;
          }
          const input = message.input;
          const task = Promise.resolve().then(() => this.query(invocation, name, input, controller.signal))
            .then((value) => {
              if (!settled) {
                worker.postMessage({ id: message.id, value });
              }
            }, error => {
              if (!settled) {
                worker.postMessage({ id: message.id, failed: true });
              } else if (
                error !== controller.signal.reason
              && !(error instanceof Error && error.name === 'AbortError')
              ) {
                throw error;
              }
            });

          queries.push(task);
          void task.catch(error => finish(undefined, error));
        } else {
          finish(message.result);
        }
      });
      worker.once('error', error => finish(undefined, error));
      worker.once('exit', () => finish());
    });
  }
}
