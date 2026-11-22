import ts from 'typescript';

import type { ITemplateObject, TemplateValue } from '../../../../domain/pages/page-rendering.js';
import { chunkNameAlias } from '../../../../domain/publication/chunk-reference.policy.js';
import { type ITemplateSource, TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { SnippetExecution } from '../../../../domain/rendering/snippet.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IRenderObservationPort } from '../../../../ports/outbound/diagnostics/render-observation.port.js';
import type { ILoaderContext, ISnippet } from '../../../../ports/outbound/publication/data-loader.port.js';
import type { SnippetWorkerPool } from './snippet-worker-pool.js';

export class ScriptSnippetAdapter implements ISnippet {
  readonly id;
  readonly parameters;
  readonly output;
  readonly phases;
  readonly compiledJavaScript: string;
  readonly execution: SnippetExecution;
  readonly cache;

  constructor(readonly source: ITemplateSource, private readonly observation?: IRenderObservationPort,
    private readonly pool?: SnippetWorkerPool) {
    const snippet = source.snippet;

    requireCondition(source.kind === TemplateSourceKind.Snippet && snippet !== undefined, 'Missing Snippet source');
    this.id = source.id;
    this.parameters = source.parameters;
    this.output = snippet!.output;
    this.phases = snippet!.phases;
    this.cache = snippet!.cache;
    this.execution = snippet!.execution ?? SnippetExecution.Sequential;
    requireCondition(Object.values(SnippetExecution).includes(this.execution), 'Invalid Snippet execution mode');

    if (snippet!.compiledJavaScript !== undefined) {
      this.compiledJavaScript = snippet!.compiledJavaScript;
    } else {
      const result = ts.transpileModule('async function __snippet(input: any, context: any) {\n'
        + snippet!.code + '\n}', {
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
      });

      requireCondition(!result.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error),
        'Invalid Snippet TypeScript');
      this.compiledJavaScript = result.outputText;
    }
  }

  async read(input: ITemplateObject, context: ILoaderContext): Promise<TemplateValue> {
    if (!this.pool) {
      throw new Error('Snippet Worker pool is required');
    }

    return this.pool.execute(this.compiledJavaScript, input, context, this.observation);
  }
}

export function snippetRegistrations(sources: readonly ITemplateSource[],
  registered: readonly ISnippet[],
  observation?: IRenderObservationPort, pool?: SnippetWorkerPool):
readonly ISnippet[] {
  const scripts = sources.filter((source) => source.kind === TemplateSourceKind.Snippet)
    .map((source) => new ScriptSnippetAdapter(source, observation, pool));
  const implementations: ISnippet[] = [...registered.filter((item) => !scripts.some((script) => script.id === item.id)),
    ...scripts];

  for (const script of scripts) {
    const alias = script.source.name ? chunkNameAlias(script.source.name) : null;

    if (
      alias
      && !implementations.some((item) => item.id === alias)
      && scripts.filter((item) => item.source.name && chunkNameAlias(item.source.name) === alias).length === 1
    ) {
      implementations.push({
        id: alias,
        parameters: script.parameters,
        output: script.output,
        phases: script.phases,
        execution: script.execution,
        ...(script.cache === undefined ? {} : { cache: script.cache }),
        read: (input, context) => script.read(input, context),
      });
    }
  }

  for (const implementation of implementations) {
    requireCondition(implementation.execution === undefined
      || Object.values(SnippetExecution).includes(implementation.execution),
    'Invalid registered Snippet execution mode');
  }

  return implementations;
}
