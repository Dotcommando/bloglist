import { createProcessSupervisor } from '../../dist/infra/resources/process-supervisor.js';

const { settings, budget } = JSON.parse(process.env.ZARYA_TEST_SUPERVISOR);

delete process.env.ZARYA_TEST_SUPERVISOR;

const supervisor = await createProcessSupervisor(settings, {
  ...budget, workerRunner: new URL(budget.workerRunner),
});

const address = supervisor.server.address();

const state = await supervisor.resources.read([]);

const workers = state.sites.flatMap(({ siteId }) => {
  const members = new Map();

  for (let i = 0; i < supervisor.pool.running(siteId); i++) {
    const worker = supervisor.pool.select(siteId);

    members.set(worker.id, { pid: worker.child.pid, port: worker.port });
  }

  return [...members.values()];
});

process.on('message', (message) => {
  if (message?.kind === 'close') {
    void supervisor.close().then(() => process.disconnect(), () => {
      process.exitCode = 1;
      process.disconnect();
    });
  }
});

process.send({ kind: 'ready', port: address.port, workers });
