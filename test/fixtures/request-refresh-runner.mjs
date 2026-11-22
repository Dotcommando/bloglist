import { parentPort, threadId } from 'node:worker_threads';

const jobs = new Map();

parentPort.on('message', (message) => {
  if (message.kind === 'generate') {
    const { jobId, input } = message;

    if (input.values.mode === 'hold') {
      return;
    }
    if (input.values.mode === 'crash') {
      process.exit(7);
    }
    if (input.values.mode === 'malformed') {
      const message = { kind: 'result', jobId };

      message.cycle = message;
      parentPort.postMessage(message);

      return;
    }
    if (input.values.mode === 'bridge') {
      jobs.set(jobId, input);
      parentPort.postMessage({ kind: 'read', jobId, id: 1, loaderId: 'Read', parameters: {}, required: true });

      return;
    }
    parentPort.postMessage({
      kind: 'result',
      jobId,
      document: {
        releaseId: input.stored.releaseId,
        pageId: input.stored.plan.pageId,
        html: String(threadId),
        inlineStyleHashes: [],
      },
    });
  } else if (message.kind === 'reply') {
    const input = jobs.get(message.jobId);

    jobs.delete(message.jobId);

    if (message.error) {
      parentPort.postMessage({ kind: 'failure', jobId: message.jobId });

      return;
    }
    parentPort.postMessage({
      kind: 'result',
      jobId: message.jobId,
      document: {
        releaseId: input.stored.releaseId,
        pageId: input.stored.plan.pageId,
        html: String(message.value),
        inlineStyleHashes: [],
        cacheable: message.cacheable,
      },
    });
  }
});
