import { Server } from 'node:http';

import { SharedDumpMaintenance } from '../../dist/adapters/outbound/backup/files/shared-dump-maintenance.js';
import { ModxCompositionAdapter } from '../../dist/adapters/outbound/rendering/modx/template-composition.adapter.js';

let requests = 0;

let renders = 0;

let freezeMs = 0;

const compose = ModxCompositionAdapter.prototype.compose;

ModxCompositionAdapter.prototype.compose = function (...args) {
  renders++;

  if (freezeMs) {
    const duration = freezeMs;

    freezeMs = 0;
    process.send({ kind: 'test-freezing' });
    const until = performance.now() + duration;

    while (performance.now() < until) {
      // Isolated fixture work blocks this site's actual published Request composition.
    }
    process.send({ kind: 'test-thawed' });
  }

  return Reflect.apply(compose, this, args);
};

const emit = Server.prototype.emit;

Server.prototype.emit = function (event, ...args) {
  if (event === 'request') {
    requests++;
  }

  return Reflect.apply(emit, this, [event, ...args]);
};

const maintenance = new SharedDumpMaintenance(JSON.parse(process.env.ZARYA_PROCESS_BOOTSTRAP).sharedMaintenanceRoot);

let heldAdmission = null;

await import('../../dist/infra/resources/site-worker.js');

process.on('message', (message) => {
  if (message?.kind === 'test-hold-write') {
    heldAdmission = maintenance.enter(false, false);
    process.send({ kind: 'test-write-held' });
  }
  if (message?.kind === 'test-release-write') {
    heldAdmission?.();
    heldAdmission = null;
    process.send({ kind: 'test-write-released' });
  }
  if (message?.kind === 'test-freeze') {
    freezeMs = Math.min(5000, message.durationMs);
  }
  if (message?.kind === 'test-diagnostics') {
    process.send({ kind: 'test-diagnostics', requests, renders, cpu: process.cpuUsage() });
  }
});
