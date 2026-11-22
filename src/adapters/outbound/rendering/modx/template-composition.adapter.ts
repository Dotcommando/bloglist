import type { IDataLoaderBinding, ITemplateObject, TemplateValue } from '../../../../domain/pages/page-rendering.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../../../domain/pages/page-rendering.js';
import { validatePageRendering } from '../../../../domain/pages/page-rendering.policy.js';
import { isPageNumber } from '../../../../domain/pages/page-tree.policy.js';
import { resolveChunkReference } from '../../../../domain/publication/chunk-reference.policy.js';
import { PublicationConsistencyError } from '../../../../domain/publication/published-document.js';
import {
  summarizePublishedPages, validatePublishedPages,
} from '../../../../domain/publication/published-page-summary.js';
import type {
  IParameterContract,
  IPublicationSnapshot,
  IRenderedDocument,
  IRenderPlan,
  ITemplateSource,
} from '../../../../domain/publication/render-plan.js';
import { ParameterKind, TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import {
  TemplateValidationError, TemplateValidationIssue,
} from '../../../../domain/publication/template-validation.error.js';
import { SnippetExecution } from '../../../../domain/rendering/snippet.js';
import { orderSnippetExecution } from '../../../../domain/rendering/snippet-execution.policy.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IDataLoader } from '../../../../ports/outbound/publication/data-loader.port.js';
import type {
  IRenderExecution,
  ITemplateCompositionPort,
} from '../../../../ports/outbound/publication/template-composition.port.js';
import type { ISnippetExecutionTask } from '../../../../ports/outbound/publication/template-composition.port.js';
import { escapeHtml, validateContexts, validateOutput } from './html-safety.js';
import { renderMarkdown } from './markdown.js';
import { isTemplateObject, validateParameters, validateValue } from './parameters.js';
import { ScriptSnippetAdapter, snippetRegistrations } from './script-snippet.adapter.js';
import { type ITagNode, type TemplateNode, tokenize } from './tags.js';

function sourceNodes(source: ITemplateSource): readonly TemplateNode[] {
  try {
    return tokenize(source.html);
  } catch (error) {
    if (error instanceof TemplateValidationError) {
      throw new TemplateValidationError({ ...error.diagnostic, source: { kind: source.kind, key: source.id } });
    }
    throw error;
  }
}

function lookup(value: TemplateValue, parts: readonly string[]): TemplateValue {
  let current = value;

  for (const key of parts) {
    if (current === null) {
      return null;
    }
    requireCondition(!['constructor', 'prototype', '__proto__'].includes(key), 'Unsafe placeholder path');
    requireCondition(isTemplateObject(current) && Object.hasOwn(current, key), `Unknown placeholder field: ${key}`);

    if (!isTemplateObject(current)) {
      throw new Error('Expected declared object');
    }
    current = current[key]!;
  }

  return current;
}

function literal(field: IParameterContract, value: string): TemplateValue {
  if (field.kind === ParameterKind.Boolean && ['true', 'false'].includes(value)) {
    return value === 'true';
  }
  if (field.kind === ParameterKind.Number && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
    return Number(value);
  }
  if (field.nullable && value === 'null') {
    return null;
  }

  return value;
}

function named(node: ITagNode): boolean {
  return !['$', '+', '*', '~'].some((prefix) => node.name.startsWith(prefix)) && !['Each', 'If'].includes(node.name);
}

function pageLink(plan: IRenderPlan, number: string): string {
  requireCondition(isPageNumber(number), 'Invalid numeric page link');
  const targets = (plan.publishedPages ?? []).filter((page) => page.siteId === plan.siteId
    && page.pageNumber === number).toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  requireCondition(targets.length > 0 && new Set(targets.map((page) => page.pageId)).size === 1,
    'Missing or ambiguous published page link: ' + number);

  return targets[0]!.path;
}

function snippetReferences(value: TemplateValue): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(snippetReferences);
  }
  if (isTemplateObject(value)) {
    return Object.values(value).flatMap(snippetReferences);
  }
  if (typeof value !== 'string') {
    return [];
  }

  return tokenize(value).flatMap((node) => 'text' in node || !node.name.startsWith('+')
    || node.name.startsWith('++') ? [] : [node.name.slice(1).split('.')[0]!]);
}

import { RenderStage } from '../../../../domain/diagnostics/page-resolution.js';
import {
  type ISnippetCachePolicy, parseSnippetCachePolicy,
} from '../../../../domain/publication/request-cache.policy.js';
import type { IRenderObservationPort } from '../../../../ports/outbound/diagnostics/render-observation.port.js';

export class ModxCompositionAdapter implements ITemplateCompositionPort {
  constructor(private readonly loaders: readonly IDataLoader[] = [],
    private readonly observation?: IRenderObservationPort) {}

  private sync<T>(stage: RenderStage, operation: () => T): T {
    return this.observation ? this.observation.sync(stage, operation) : operation();
  }

  async prepare(snapshot: IPublicationSnapshot, pageId: string): Promise<IRenderPlan> {
    const page = snapshot.pages.find((entry) => entry.pageId === pageId);

    requireCondition(page?.siteId === snapshot.siteId, 'Missing or foreign page');

    if (page && (page.mimeType ?? 'text/html') !== 'text/html') {
      return {
        planId: page.pageId,
        siteId: snapshot.siteId,
        pageId,
        page,
        settings: {},
        requestParameters: [],
        buildValues: {},
        templates: [],
        loaders: [],
        frontendSourceIds: [],
        rendering: {
          templateId: 'RawText',
          delivery: HtmlDelivery.Static,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      };
    }

    const loaders = snippetRegistrations(snapshot.templates, this.loaders);

    if (!page?.rendering) {
      throw new Error('Page needs a rendering configuration');
    }
    validatePageRendering(page.rendering);
    const template = snapshot.templates.find((source) => source.id === page.rendering?.templateId
      && source.kind === TemplateSourceKind.Template);

    requireCondition(template !== undefined, 'Unknown page template');

    if (!template) {
      throw new Error('Missing template');
    }
    validateParameters(template.parameters, page.rendering.parameters);
    requireCondition(new Set(snapshot.templates.map((source) => `${source.kind}:${source.id}`)).size
      === snapshot.templates.length, 'Duplicate template/chunk registration');
    const snippetCachePolicies: Record<string, ISnippetCachePolicy> = {};
    const validateCache = (id: string, phase: LoaderPhase): void => {
      if (!page.rendering?.requestCache || phase !== LoaderPhase.Request) {
        return;
      }

      const loader = loaders.find((entry) => entry.id === id);

      requireCondition(loader?.cache !== undefined, 'Request cache needs explicitly public cache-safe Snippets');
      const policy = parseSnippetCachePolicy(loader!.cache);

      requireCondition(page.rendering.requestCache.ttlMs <= policy.maxAgeMs,
        'Request cache TTL exceeds a Snippet freshness contract');
      snippetCachePolicies[id] = policy;
    };
    const used = new Set<string>(['site', `pages/${page.mark}`]);
    const active = new Set<string>();
    let usesPageMarkdown = false;
    let requestPagination = page.rendering.loaders.some((binding) => binding.loaderId === 'Pagination'
      && binding.phase === LoaderPhase.Request);
    const visit = (source: ITemplateSource, requestScope = false, requestInputs:
    ReadonlySet<string> = new Set()): void => {
      const key = `${source.kind}:${source.id}`;

      requireCondition(!active.has(key), `Cyclic include: ${key}`);
      active.add(key);

      if (source.frontendSourceId) {
        used.add(source.frontendSourceId);
      }

      const nodes = sourceNodes(source);

      usesPageMarkdown ||= nodes.some((node) => 'tag' in node && node.name === '*contentMd:markdown');

      requireCondition(source.parameters.every((field) => !['page', 'site', 'request'].includes(field.name)),
        'Reserved context name used as a parameter');

      validateContexts(nodes, source.kind === TemplateSourceKind.Chunk);
      const aliases = new Set<string>(source.parameters.map((field) => field.name));
      const graph = new Map<string, { phase: LoaderPhase;
        values: readonly TemplateValue[
        ];
        dependsOn: readonly string[] }>();

      if (source === template) {
        for (const binding of page.rendering!.loaders) {
          requireCondition(!aliases.has(binding.alias), 'Loader alias collides with a parameter');
          aliases.add(binding.alias);
          const loader = loaders.find((loader) => loader.id === binding.loaderId);

          requireCondition(loader?.phases.includes(binding.phase) === true, 'Unsupported registered loader');
          validateCache(binding.loaderId, binding.phase);
          graph.set(binding.alias, {
            phase: binding.phase,
            values: Object.values(
              binding.parameters),
            dependsOn: binding.dependsOn,
          });
        }
      }

      for (const node of nodes) {
        if ('text' in node) {
          continue;
        }
        requireCondition(page.rendering!.delivery !== HtmlDelivery.Static || !node.request,
          'Request dependency on a Static page');

        if (named(node)) {
          requestPagination ||= node.name === 'Pagination' && node.request;
          const alias = node.parameters.as;

          requireCondition(Boolean(alias && /^[A-Za-z][A-Za-z0-9_]*$/.test(alias))
            && !aliases.has(alias ?? '') && !['page', 'site', 'request'].includes(alias ?? ''),
          'Loader needs a unique local &as alias');
          aliases.add(alias!);
          const loader = loaders.find((loader) => loader.id === node.name);
          const phase = node.request ? LoaderPhase.Request : LoaderPhase.Build;

          validateCache(node.name, phase);
          graph.set(alias!, {
            phase,
            values: Object.entries(node.parameters).filter(([key]) => key !== 'as')
              .map(([, value]) => value),
            dependsOn: [],
          });

          requireCondition(Boolean(loader?.phases.includes(phase)), `Unknown or unsupported loader: ${node.name}`);
          this.checkArguments(loader!.parameters, Object.fromEntries(Object.entries(node.parameters)
            .filter(([key]) => key !== 'as')));
        }
      }
      const references = snippetReferences;
      const checked = new Set<string>();
      const visiting = new Set<string>();
      const check = (alias: string): void => {
        if (checked.has(alias)) {
          return;
        }
        requireCondition(!visiting.has(alias), `Cyclic loader alias: ${alias}`);
        visiting.add(alias);
        const binding = graph.get(alias)!;

        requireCondition(binding.phase !== LoaderPhase.Build || !requestScope,
          'Build loader inside Request-only scope');

        for (const dependency of [...binding.dependsOn, ...binding.values.flatMap(references)]) {
          requireCondition(dependency === 'request' || aliases.has(dependency),
            `Unknown local dependency: ${dependency}`);
          requireCondition(binding.phase !== LoaderPhase.Build || (dependency !== 'request'
            && !requestInputs.has(dependency) && graph.get(dependency)?.phase !== LoaderPhase.Request),
          'Build loader cannot depend on Request data');

          if (graph.has(dependency)) {
            check(dependency);
          }
        }
        visiting.delete(alias);
        checked.add(alias);
      };

      for (const alias of graph.keys()) {
        check(alias);
      }
      const requestDependent = (value: string): boolean => references(value).some((name) =>
        name === 'request' || requestInputs.has(name) || graph.get(name)?.phase === LoaderPhase.Request);

      for (const node of nodes) {
        if ('text' in node) {
          continue;
        }
        requireCondition(page.rendering!.delivery !== HtmlDelivery.Static || !requestDependent(`[[${node.tag}]]`),
          'Request placeholder on a Static page');

        const targets = node.name.startsWith('$') ? [node.name.slice(1)]
          : node.name === 'Each' ? [node.parameters.chunk]
            : node.name === 'If' ? [node.parameters.then, node.parameters.else].filter(Boolean) : [];

        for (const id of targets) {
          const chunk = resolveChunkReference(snapshot.templates, id ?? '');
          const parameters = Object.fromEntries(Object.entries(node.parameters)
            .filter(([key]) => !(['Each', 'If'].includes(node.name) && ['items', 'chunk', 'as',
              'condition', 'then', 'else'].includes(key))));

          if (node.name === 'Each') {
            parameters[node.parameters.as ?? 'item'] = '[[+item]]';
          }
          this.checkArguments(chunk.parameters, parameters, chunk);
          const tainted = new Set(Object.entries(parameters).filter(([, value]) =>
            requestDependent(value)).map(([key]) => key));

          visit(chunk, requestScope || node.request || (node.name === 'Each'
&& requestDependent(node.parameters.items ?? ''))
            || (node.name === 'If' && requestDependent(node.parameters.condition ?? '')), tainted);
        }
      }
      active.delete(key);
    };

    visit(template);
    const publishedPages = snapshot.publishedPages
      ?? summarizePublishedPages(snapshot.siteId, snapshot.pages, snapshot.urls, snapshot.templateValues);

    validatePublishedPages(snapshot.siteId, publishedPages);
    const requestParameters = [...snapshot.requestParameters];

    if (requestPagination) {
      const field = requestParameters.find((field) => field.name === 'page');

      requireCondition(!field || field.kind === ParameterKind.String, 'Pagination requires String request.page');

      if (!field) {
        requestParameters.push({ name: 'page', kind: ParameterKind.String, required: false, defaultValue: '1' });
      }
    }

    const plan: IRenderPlan = {
      ...(page.rendering.requestCache ? { snippetCachePolicies } : {}),
      publishedPages,
      templateValues: snapshot.templateValues?.[pageId] ?? {},
      ...(snapshot.jsonLd ? { jsonLd: structuredClone(snapshot.jsonLd) } : {}),
      planId: page.pageId,
      siteId: snapshot.siteId,
      pageId,
      page,
      rendering: page.rendering,
      settings: snapshot.settings,
      requestParameters,
      buildValues: {},
      snippetExecutions: Object.fromEntries(loaders.map((loader) =>
        [loader.id, loader.execution ?? SnippetExecution.Sequential])),
      templates: snapshot.templates.map((source) => source.snippet ? {
        ...source,
        snippet: { ...source.snippet, compiledJavaScript: new ScriptSnippetAdapter(source).compiledJavaScript },
      } : source),
      loaders: page.rendering.loaders,
      frontendSourceIds: snapshot.frontendSources.filter((source) => used.has(source.id)).map((source) => source.id),
    };
    const effective = { contentMd: page.contentMd, ...page.rendering.parameters, ...plan.templateValues };
    const content = effective.contentMd;

    if (usesPageMarkdown && (content === null || typeof content === 'string') && !content?.includes('[[~')) {
      const trusted = Object.hasOwn(plan.templateValues ?? {}, 'contentMd');

      return {
        ...plan,
        preparedMarkdown: {
          source: content,
          trusted,
          html: await renderMarkdown(content, trusted, (number) => pageLink(plan, number)),
        },
      };
    }

    return plan;
  }

  private checkArguments(schema: readonly IParameterContract[], parameters: Readonly<Record<string, string>>,
    chunk?: ITemplateSource): void {
    for (const key of Object.keys(parameters)) {
      if (chunk && !schema.some((field) => field.name === key)) {
        throw new TemplateValidationError({
          issue: TemplateValidationIssue.UnknownChunkParameter,
          source: { kind: chunk.kind, key: chunk.id },
          parameter: key,
        });
      }
      requireCondition(schema.some((field) => field.name === key), `Unknown argument: ${key}`);
    }

    for (const field of schema) {
      const raw = parameters[field.name];

      if (chunk && raw === undefined && field.required && field.defaultValue === undefined) {
        throw new TemplateValidationError({
          issue: TemplateValidationIssue.MissingChunkParameter,
          source: { kind: chunk.kind, key: chunk.id },
          parameter: field.name,
        });
      }

      requireCondition(raw !== undefined || !field.required || field.defaultValue !== undefined,
        `Missing argument: ${field.name}`);

      if (raw !== undefined && !raw.includes('[[')) {
        validateValue(field, literal(field, raw));
      }
    }
  }

  async compose(plan: IRenderPlan, values: ITemplateObject, execution: IRenderExecution): Promise<IRenderedDocument> {
    if ((plan.page.mimeType ?? 'text/html') !== 'text/html') {
      return {
        pageId: plan.pageId,
        html: plan.page.contentMd,
        mimeType: plan.page.mimeType ?? 'text/plain',
        frontendSourceIds: [],
      };
    }

    const loaders = snippetRegistrations(plan.templates, this.loaders, this.observation);
    const request = execution.phase === LoaderPhase.Request && plan.rendering.delivery === HtmlDelivery.Request
      ? validateParameters(plan.requestParameters, execution.request) : {};
    const frozen: Record<string, TemplateValue> = { ...values };
    const seoTitle = plan.page.metaTitle || plan.page.title;
    const description = plan.page.metaDescription ?? '';
    const ogDescription = plan.page.ogDescription || description;
    const page: ITemplateObject = {
      id: plan.page.pageNumber ?? null,
      title: plan.page.title,
      h1: plan.page.h1,
      metaTitle: plan.page.metaTitle,
      metaDescription: plan.page.metaDescription,
      robotsIndex: plan.page.robotsIndex,
      ogTitle: plan.page.ogTitle ?? null,
      ogDescription: plan.page.ogDescription ?? null,
      ogImage: plan.page.ogImage ?? null,
      ogType: plan.page.ogType ?? null,
      seo: {
        title: seoTitle,
        heading: plan.page.h1 || plan.page.title,
        description,
        robots: plan.page.robotsIndex ? 'index,follow' : 'noindex,follow',
        ogTitle: plan.page.ogTitle || seoTitle,
        ogDescription,
        ogImage: plan.page.ogImage ?? '',
        ogType: plan.page.ogType ?? 'website',
        hasDescription: Boolean(description),
        hasOgDescription: Boolean(ogDescription),
        hasOgImage: Boolean(plan.page.ogImage),
      },
      contentMd: plan.page.contentMd,
      language: plan.page.language,
      pageId: plan.pageId,
      ...plan.rendering.parameters,
      ...plan.templateValues,
    };
    const snippetValues: Record<string, TemplateValue> = {};
    const parallel = Object.values(plan.snippetExecutions ?? {}).includes(SnippetExecution.ParallelRead);
    const safety = new Map<string, boolean>();
    const safeNode = (node: TemplateNode): boolean => {
      if ('text' in node || node.request && execution.phase === LoaderPhase.Build) {
        return true;
      }
      if (named(node)) {
        if (!node.request && execution.allowBuildExecution === false) {
          return true;
        }

        return plan.snippetExecutions?.[node.name] === SnippetExecution.ParallelRead;
      }

      const targets = node.name.startsWith('$') ? [node.name.slice(1)]
        : node.name === 'Each' ? [node.parameters.chunk ?? '']
          : node.name === 'If' ? [node.parameters.then, node.parameters.else]
            .filter((id) => id !== undefined && id !== '')
            : [];

      return targets.every((id) => safeSource(resolveChunkReference(plan.templates, id!)));
    };
    const safeSource = (source: ITemplateSource): boolean => {
      const key = source.kind + ':' + source.id;
      const known = safety.get(key);

      if (known !== undefined) {
        return known;
      }
      safety.set(key, false);
      const safe = sourceNodes(source).every(safeNode);

      safety.set(key, safe);

      return safe;
    };
    const scopes = async (tasks: readonly ISnippetExecutionTask[], signal?: AbortSignal): Promise<void> => {
      if (parallel && execution.scopes) {
        await execution.scopes(tasks, signal);
      } else {
        const sequential = signal ?? new AbortController().signal;

        for (const task of tasks) {
          sequential.throwIfAborted();
          await task.run(sequential);
        }
      }
    };
    const render = async (source: ITemplateSource, input: ITemplateObject, scope: string,
      root: boolean, scopeSignal?: AbortSignal): Promise<string> => {
      const parameters = this.sync(RenderStage.Input, () => validateParameters(source.parameters, input));
      const nodes = this.sync(RenderStage.Tokenization, () => sourceNodes(source));
      const declarations = new Map<string, { binding: IDataLoaderBinding;
        raw:
Readonly<Record<string, string>> | null }>();

      if (root) {
        for (const binding of plan.loaders) {
          declarations.set(binding.alias, { binding, raw: null });
        }
      }

      for (const node of nodes) {
        if ('text' in node || !named(node)) {
          continue;
        }

        const alias = node.parameters.as!;

        declarations.set(alias, {
          binding: {
            loaderId: node.name,
            alias,
            phase: node.request ? LoaderPhase.Request
              : LoaderPhase.Build,
            parameters: {},
            dependsOn: [],
            required: true,
          },
          raw: Object.fromEntries(Object.entries(node.parameters).filter(([key]) => key !== 'as')),
        });
      }
      const resolved = new Map<string, TemplateValue | undefined>();
      const aliasPending = new Map<string, Promise<TemplateValue | undefined>>();
      const resolveAlias = async (alias: string, signal?: AbortSignal): Promise<TemplateValue | undefined> => {
        if (resolved.has(alias)) {
          return resolved.get(alias);
        }

        const declaration = declarations.get(alias);

        requireCondition(declaration !== undefined, `Unknown local placeholder: ${alias}`);

        if (!declaration) {
          throw new Error('Missing loader alias');
        }

        const { binding, raw } = declaration;
        const key = `${scope}/${alias}`;

        if (binding.phase === LoaderPhase.Request && execution.phase === LoaderPhase.Build) {
          resolved.set(alias, undefined);

          return undefined;
        }
        if (binding.phase === LoaderPhase.Build && Object.hasOwn(frozen, key)) {
          resolved.set(alias, frozen[key]);

          return frozen[key];
        }
        if (binding.phase === LoaderPhase.Build && execution.allowBuildExecution === false) {
          throw new PublicationConsistencyError(`Missing frozen Build binding: ${key}`);
        }

        for (const dependency of binding.dependsOn) {
          await aliasValue(dependency, signal);
        }
        const loader = loaders.find((item) => item.id === binding.loaderId);

        requireCondition(loader !== undefined, `Unknown loader: ${binding.loaderId}`);
        const args: Record<string, TemplateValue> = {};

        for (const field of loader!.parameters) {
          const value = raw ? raw[field.name] : binding.parameters[field.name];

          if (value === undefined) {
            continue;
          }

          const evaluated = typeof value === 'string' ? await evaluate(value, field) : value;

          requireCondition(evaluated !== undefined, 'Build loader cannot consume Request data');

          if (evaluated !== undefined) {
            args[field.name] = evaluated;
          }
        }

        if (raw) {
          this.checkArguments(loader!.parameters, raw);
        }

        const result = await execution.read(binding, validateParameters(loader!.parameters, args), signal);

        if (binding.phase === LoaderPhase.Build) {
          frozen[key] = result;
        }
        resolved.set(alias, result);

        return result;
      };
      const aliasValue = (alias: string, signal?: AbortSignal): Promise<TemplateValue | undefined> => {
        let pending = aliasPending.get(alias);

        if (!pending) {
          pending = Promise.resolve().then(() => resolveAlias(alias, signal));
          aliasPending.set(alias, pending);
        }

        return pending;
      };
      const valueOf = async (node: ITagNode): Promise<TemplateValue | undefined> => {
        if (node.request && execution.phase === LoaderPhase.Build) {
          return undefined;
        }

        const name = node.name.replace(/:markdown$/, '');

        if (name.startsWith('~')) {
          return pageLink(plan, name.slice(1));
        }
        if (name.startsWith('++')) {
          return lookup(plan.settings, name.slice(2).split('.'));
        }
        if (name.startsWith('*')) {
          return lookup(page, name.slice(1).split('.'));
        }
        requireCondition(name.startsWith('+'), 'Only value tags are valid inside parameters');
        const [head, ...tail] = name.slice(1).split('.');

        if (head === 'request') {
          requireCondition(root, 'Pass request values explicitly to chunks');

          if (execution.phase === LoaderPhase.Build) {
            return undefined;
          }

          return lookup(request, tail);
        }

        const value = Object.hasOwn(parameters, head!) ? parameters[head!] : await aliasValue(head!);

        return value === undefined ? undefined : lookup(value, tail);
      };
      const evaluate = async (raw: string, field: IParameterContract): Promise<TemplateValue | undefined> => {
        const parts = this.sync(RenderStage.Parameters, () => tokenize(raw));

        if (parts.length === 1 && parts[0] && 'tag' in parts[0]) {
          return valueOf(parts[0]);
        }
        if (parts.every((part) => 'text' in part)) {
          return literal(field, raw);
        }

        let output = '';

        for (const part of parts) {
          const value = 'text' in part ? part.text : await valueOf(part);

          if (value === undefined) {
            return undefined;
          }
          requireCondition(value === null || ['string', 'number', 'boolean'].includes(typeof value),
            'Mixed interpolation requires scalar values');
          output += value === null ? '' : String(value);
        }

        return output;
      };
      const tasks: ISnippetExecutionTask[] = [...declarations].map(([id, { binding, raw }]) => {
        const references = Object.values(raw ?? binding.parameters).flatMap(snippetReferences);

        for (const reference of [...binding.dependsOn, ...references]) {
          requireCondition(declarations.has(reference) || Object.hasOwn(parameters, reference)
            || reference === 'request', `Unknown local dependency: ${reference}`);
        }

        return {
          id,
          dependsOn: [...new Set([...binding.dependsOn, ...references].filter((name) => declarations.has(name)))],
          execution: plan.snippetExecutions?.[binding.loaderId] ?? SnippetExecution.Sequential,
          run: async (signal) => {
            await aliasValue(id, signal);
          },
        };
      });
      const ordered = orderSnippetExecution(tasks);
      const prepare = async (): Promise<void> => {
        if (execution.schedule && tasks.some((task) => task.execution === SnippetExecution.ParallelRead)) {
          await execution.schedule(tasks, scopeSignal);
        } else {
          for (const task of ordered) {
            await aliasValue(task.id, scopeSignal);
          }
        }
      };

      await (this.observation?.measure(RenderStage.Preparation, prepare) ?? prepare());
      const markup = this.observation?.start?.(RenderStage.Composition);
      const renderNode = async (index: number, node: TemplateNode, signal: AbortSignal): Promise<string> => {
        signal.throwIfAborted();

        if ('text' in node) {
          return node.text;
        }
        if (named(node) || node.request && execution.phase === LoaderPhase.Build) {
          return '';
        }

        let html = '';

        if (node.name.startsWith('$') || ['Each', 'If'].includes(node.name)) {
          let items: readonly TemplateValue[] = [null];
          let target = node.name.slice(1);

          if (node.name === 'Each') {
            const value = await evaluate(node.parameters.items ?? '', {
              name: 'items', kind: ParameterKind.Array, required: true,
            });

            if (value === undefined) {
              return '';
            }
            requireCondition(Array.isArray(value), 'Each requires an array');

            if (!Array.isArray(value)) {
              throw new Error('Expected array');
            }
            items = value;
            target = node.parameters.chunk ?? '';
          } else if (node.name === 'If') {
            const condition = await evaluate(node.parameters.condition ?? '',
              { name: 'condition', kind: ParameterKind.Boolean, required: true });

            if (condition === undefined) {
              return '';
            }
            requireCondition(typeof condition === 'boolean', 'If requires a boolean');
            target = (condition ? node.parameters.then : node.parameters.else) ?? '';

            if (!target) {
              return '';
            }
          }

          const chunk = resolveChunkReference(plan.templates, target);
          const renderItem = async (item: TemplateValue, itemIndex: number,
            childSignal: AbortSignal): Promise<string> => {
            const args: Record<string, TemplateValue> = {};
            let deferred = false;

            for (const field of chunk.parameters) {
              if (node.name === 'Each' && field.name === (node.parameters.as ?? 'item')) {
                args[field.name] = item;
                continue;
              }
              if (node.parameters[field.name] === undefined) {
                continue;
              }

              const value = await evaluate(node.parameters[field.name]!, field);

              if (value === undefined) {
                deferred = true;
                break;
              }
              args[field.name] = value;
            }

            if (!deferred) {
              return render(chunk, args, `${scope}/${index}:${itemIndex}`, false, childSignal);
            }

            return '';
          };

          if (!parallel) {
            let sequential = '';

            for (const [itemIndex, item] of items.entries()) {
              sequential += await renderItem(item, itemIndex, signal);
            }

            return sequential;
          }

          const output: string[] = [];
          const children: ISnippetExecutionTask[] = items.map((item, itemIndex) => ({
            id: `${scope}/${index}:${itemIndex}`,
            dependsOn: [],
            execution: safeSource(chunk) ? SnippetExecution.ParallelRead : SnippetExecution.Sequential,
            run: async (childSignal) => {
              output[itemIndex] = await renderItem(item, itemIndex, childSignal);
            },
          }));

          await scopes(children, signal);

          return output.join('');
        }

        const value = await valueOf(node);

        if (value === undefined) {
          return '';
        }
        if (node.name.endsWith(':markdown')) {
          requireCondition(value === null || typeof value === 'string', 'Markdown content must be text');
          const trustedTv = node.name.startsWith('*')
            && Object.hasOwn(plan.templateValues ?? {}, node.name.slice(1, -':markdown'.length));
          const prepared = node.name === '*contentMd:markdown' ? plan.preparedMarkdown : undefined;

          html += prepared?.source === value && prepared.trusted === trustedTv
            ? prepared.html : await renderMarkdown(value === null ? null : String(value), trustedTv,
              (number) => pageLink(plan, number));
        } else {
          requireCondition(value === null || ['string', 'number', 'boolean'].includes(typeof value),
            'Cannot emit an object/array as HTML');
          html += escapeHtml(value === null ? '' : String(value));
        }

        return html;
      };
      let html = '';

      if (!parallel) {
        const signal = scopeSignal ?? new AbortController().signal;

        for (const [index, node] of nodes.entries()) {
          if ('text' in node) {
            html += node.text;
          } else if (!named(node) && !(node.request && execution.phase === LoaderPhase.Build)) {
            html += await renderNode(index, node, signal);
          }
        }
      } else {
        const output: string[] = [];
        const markupTasks: ISnippetExecutionTask[] = nodes.map((node, index) => ({
          id: scope + '/markup/' + index,
          dependsOn: [],
          execution: safeNode(node) ? SnippetExecution.ParallelRead : SnippetExecution.Sequential,
          run: async (signal) => {
            output[index] = await renderNode(index, node, signal);
          },
        }));

        await scopes(markupTasks, scopeSignal);
        html = output.join('');
      }
      if (root) {
        for (const [name, value] of resolved) {
          if (value !== undefined) {
            snippetValues[name] = value;
          }
        }
      }

      markup?.finish();

      return html;
    };
    const template = plan.templates.find((entry) => entry.kind === TemplateSourceKind.Template
      && entry.id === plan.rendering.templateId)!;
    const html = await render(template, plan.rendering.parameters, 'root', true);

    this.sync(RenderStage.Validation, () => validateOutput(html));

    return {
      pageId: plan.pageId,
      html,
      frontendSourceIds: plan.frontendSourceIds,
      buildValues: parallel
        ? Object.fromEntries(Object.entries(frozen).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : frozen,
      snippetValues: parallel
        ? Object.fromEntries(Object.entries(snippetValues)
          .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : snippetValues,
    };
  }
}
