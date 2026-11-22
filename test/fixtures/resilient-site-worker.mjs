import { appendFile, readFile } from 'node:fs/promises';
import { Server } from 'node:http';
import path from 'node:path';

import { FilePublishedContentAdapter } from
  '../../dist/adapters/outbound/publication/files/published-content.adapter.js';

let holdPlan = false;

let releasePlan;

const readPlan = FilePublishedContentAdapter.prototype.readPlan;

FilePublishedContentAdapter.prototype.readPlan = async function (...args) {
  const result = await Reflect.apply(readPlan, this, args);

  if (holdPlan) {
    holdPlan = false;
    await new Promise((resolve) => {
      releasePlan = resolve;
      process.send({ kind: 'test-plan-held', releaseId: args[1] });
    });
  }

  return result;
};

const readArtifact = FilePublishedContentAdapter.prototype.readPublicArtifact;

FilePublishedContentAdapter.prototype.readPublicArtifact = async function (...args) {
  const result = await Reflect.apply(readArtifact, this, args);

  if (holdPlan) {
    holdPlan = false;
    await new Promise((resolve) => {
      releasePlan = resolve;
      process.send({ kind: 'test-plan-held', releaseId: args[1] });
    });
  }

  return result;
};

const emit = Server.prototype.emit;

Server.prototype.emit = function (event, ...args) {
  if (event === 'request') {
    args[1].setHeader('X-Test-Worker', String(process.pid));

    if (args[0].url === '/__test/commit' && args[0].method === 'POST') {
      const [request, response] = args;

      void (async () => {
        for await (const chunk of request) {
          void chunk;
        }
        await appendFile(path.join(settings.sourcesRoot, '../test-commits'), 'committed\n');
        process.send({ kind: 'test-committed' });
        // Deliberately lose the acknowledgement by killing this worker in the test.
      })().catch(() => response.destroy());

      return true;
    }
  }

  return Reflect.apply(emit, this, [event, ...args]);
};

process.on('message', (message) => {
  if (message?.kind === 'test-hold-plan') {
    holdPlan = true;
    process.send({ kind: 'test-plan-armed' });
  }
  if (message?.kind === 'test-release-plan') {
    releasePlan?.();
    releasePlan = undefined;
  }
});

const settings = JSON.parse(process.env.ZARYA_PROCESS_BOOTSTRAP);

try {
  const mongoUri = JSON.parse(await readFile(path.join(settings.sourcesRoot, '../worker-mongo-uri.json'), 'utf8'));

  process.env.ZARYA_PROCESS_BOOTSTRAP = JSON.stringify({ ...settings, mongoUri });
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

await import('../../dist/infra/resources/site-worker.js');
