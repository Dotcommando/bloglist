import { parentPort, workerData } from 'node:worker_threads';

import { DocumentOutputAdapter } from '../../adapters/outbound/rendering/html/document-output.adapter.js';
import { JsonLdDocumentAdapter } from '../../adapters/outbound/rendering/html/json-ld-document.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { LoaderExecutionAdapter } from '../../adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { snippetRegistrations } from '../../adapters/outbound/rendering/modx/script-snippet.adapter.js';
import { ModxCompositionAdapter } from '../../adapters/outbound/rendering/modx/template-composition.adapter.js';
import {
  RefreshMessageKind, type RefreshRegistration,
} from '../../adapters/outbound/rendering/workers/request-refresh.protocol.js';
import { JsonLdRenderRuntimeService } from '../../app/services/json-ld/json-ld-render-runtime.service.js';
import {
  PublishedDocumentRenderingService,
} from '../../app/services/publication/published-document-rendering.service.js';
import { RenderDataService } from '../../app/services/publication/render-data.service.js';
import { BuildJsonLdPageUseCase } from '../../app/use-cases/json-ld/build-json-ld-page.use-case.js';
import type { ITemplateObject, TemplateValue } from '../../domain/pages/page-rendering.js';
import { PublishedDataUnavailableError } from '../../domain/publication/published-document.js';
import type { ILoaderContext, ISnippet } from '../../ports/outbound/publication/data-loader.port.js';
import type { IRequestDocumentGeneration } from '../../ports/outbound/publication/request-document-refresh.port.js';

if (!parentPort) {
  throw new Error('A background rendering channel is required');
}

const channel = parentPort;

const startup: { registrations: readonly RefreshRegistration[] } = workerData;

const registrations = startup.registrations;

if (!Array.isArray(registrations)) {
  throw new Error('Invalid background registrations');
}

let active: { id: number;
  pending: Map<number, {
    resolve: (value: TemplateValue) => void; reject: (error: Error) => void; uncacheable: (() => void) | undefined;
  }>;
  sequence: number } | null = null;

function read(loaderId: string, parameters: ITemplateObject, context: ILoaderContext): Promise<TemplateValue> {
  const job = active;

  if (!job) {
    return Promise.reject(new PublishedDataUnavailableError('No active background render'));
  }

  return new Promise<TemplateValue>((resolve, reject) => {
    const id = ++job.sequence;

    job.pending.set(id, { resolve, reject, uncacheable: context.onUncacheable });

    try {
      channel.postMessage({ kind: RefreshMessageKind.Read, jobId: job.id, id, loaderId, parameters, required: true });
    } catch {
      job.pending.delete(id);
      reject(new PublishedDataUnavailableError('Background data channel failed'));
    }
  });
}

async function generate(jobId: number, input: IRequestDocumentGeneration): Promise<void> {
  if (active) {
    throw new Error('Concurrent background render on one Worker');
  }
  active = { id: jobId, pending: new Map(), sequence: 0 };
  const native: readonly ISnippet[] = registrations.map((registration) => ({
    ...registration, read: (parameters, context) => read(registration.id, parameters, context),
  }));
  const definitions = snippetRegistrations(input.stored.plan.templates, native).map((definition): ISnippet => ({
    ...definition, read: (parameters, context) => read(definition.id, parameters, context),
  }));
  const execution = new LoaderExecutionAdapter(definitions);
  const runtime = new JsonLdRenderRuntimeService(new RenderDataService(new ModxCompositionAdapter(native), {
    validate: (id, phase, required) => execution.validate(id, phase, required),
    execute: (id, parameters, context, required) =>
      execution.execute(id, parameters, { ...context, snippetSources: [] }, required),
  }), new BuildJsonLdPageUseCase(), new JsonLdDocumentAdapter());
  const documents = new PublishedDocumentRenderingService(
    runtime, new DocumentOutputAdapter(), new MarkdownConversionAdapter(),
  );
  const document = await documents.generate(input, new AbortController().signal);

  if (active.pending.size) {
    throw new Error('Unfinished background data reads');
  }
  channel.postMessage({ kind: RefreshMessageKind.Result, jobId, document });
  active = null;
}

channel.on('message', (message: { kind: RefreshMessageKind;
  jobId: number;
  id: number;
  input: IRequestDocumentGeneration;
  value: TemplateValue;
  cacheable: boolean;
  error: boolean }) => {
  if (message.kind === RefreshMessageKind.Reply && active?.id === message.jobId) {
    const pending = active.pending.get(message.id);

    if (!pending) {
      return;
    }
    active.pending.delete(message.id);

    if (message.error) {
      pending.reject(new PublishedDataUnavailableError('Background data unavailable'));
    } else {
      if (message.cacheable === false) {
        pending.uncacheable?.();
      }
      pending.resolve(message.value);
    }
  } else if (message.kind === RefreshMessageKind.Generate) {
    void generate(message.jobId, message.input).then(() => { /* The complete result was sent by generate. */ }, () => {
      active = null;

      try {
        channel.postMessage({ kind: RefreshMessageKind.Failure, jobId: message.jobId });
      } catch {
        channel.close();
      }
    });
  }
});
