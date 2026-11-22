import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import { expect, it } from 'vitest';

import { forkHarness, workerMessage } from '../support/fork-harness.js';

interface ISupervisorReady {
  port: number;
  workers: { pid: number; port: number }[];
}

function supervisorReady(value: Record<string, unknown>): ISupervisorReady {
  if (typeof value.port !== 'number' || !Array.isArray(value.workers)) {
    throw new Error('Invalid supervisor readiness');
  }

  const workers = value.workers.map((entry: unknown) => {
    if (
      !entry
      || typeof entry !== 'object'
      || !('pid' in entry)
      || typeof entry.pid !== 'number'
      || !('port' in entry)
      || typeof entry.port !== 'number'
    ) {
      throw new Error('Invalid serving process identity');
    }

    return { pid: entry.pid, port: entry.port };
  });

  return { port: value.port, workers };
}

it('drains a real long request during pool replacement while other site processes keep answering', async () => {
  const f = await forkHarness();
  const site = f.sites[0]!;
  let held: ReturnType<typeof f.read> | undefined;
  let changing: Promise<unknown> | undefined;
  const worker = f.supervisor.pool.select(site.siteId);

  try {
    await f.supervisor.pool.resize(site.siteId, 2);
    const armed = workerMessage(worker.child, 'test-plan-armed');

    worker.child.send({ kind: 'test-hold-plan' });
    await armed;
    const holding = workerMessage(worker.child, 'test-plan-held');

    held = f.read(site.host);
    void held.catch(() => {});
    await holding;
    let complete = false;

    changing = f.supervisor.pool.configureDatabasePoolSize(2).then(() => {
      complete = true;
    });
    void changing.catch(() => {});
    await expect.poll(() => worker.retiring, { timeout: 15000 }).toBe(true);
    expect(complete).toBe(false);

    for (let i = 0; i < 12; i++) {
      expect((await f.read(site.host)).status).toBe(200);
      expect((await f.read(f.sites[1]!.host)).status).toBe(200);
      expect((await f.read(site.host, '/api/health')).status).toBe(200);
    }
    worker.child.send({ kind: 'test-release-plan' });
    expect((await held).status).toBe(200);
    await changing;
    expect(worker.exited).toBe(true);
    expect(f.supervisor.pool.running(site.siteId)).toBe(2);
    expect(f.supervisor.pool.hasDatabasePoolSize(2)).toBe(true);
  } finally {
    if (!worker.exited) {
      worker.child.send({ kind: 'test-release-plan' });
    }
    await Promise.allSettled([held, changing]);
    await f.close();
  }
}, 90000);

it('replaces killed workers without affecting neighboring sites or the control plane', async () => {
  const f = await forkHarness();
  const site = f.sites[0]!;
  let held: ReturnType<typeof f.read> | undefined;

  try {
    const worker = f.supervisor.pool.select(site.siteId);
    const armed = workerMessage(worker.child, 'test-plan-armed');

    worker.child.send({ kind: 'test-hold-plan' });
    await armed;
    const holding = workerMessage(worker.child, 'test-plan-held');

    held = f.read(site.host);
    const observed = held.then((value) => ({ value }), (error: unknown) => ({ error }));

    await holding;
    const exited = once(worker.child, 'exit');

    worker.child.kill('SIGKILL');
    await exited;
    const outcome = await observed;

    if ('value' in outcome) {
      expect(outcome.value.status).toBe(503);
    }
    expect((await f.read(f.sites[1]!.host)).body).toContain('Two old');
    expect((await f.read(site.host, '/api/health')).status).toBe(200);
    await expect.poll(() => f.supervisor.pool.running(site.siteId), { timeout: 15000 }).toBe(1);
    expect(f.supervisor.pool.select(site.siteId).child.pid).not.toBe(worker.child.pid);
    expect((await f.read(site.host)).body).toContain('One old');
    await f.supervisor.pool.resize(site.siteId, 2);
    const sibling = f.supervisor.pool.select(site.siteId);
    const secondExit = once(sibling.child, 'exit');

    sibling.child.kill('SIGKILL');
    await secondExit;
    expect((await f.read(site.host)).status).toBe(200);
    await expect.poll(() => f.supervisor.pool.running(site.siteId), { timeout: 15000 }).toBe(2);
  } finally {
    await Promise.allSettled([held]);
    await f.close();
  }
}, 90000);

it('reaps orphaned serving children after coordinator SIGKILL and restarts from the saved allocation', async () => {
  const f = await forkHarness();
  const site = f.sites[0]!;
  const initial = await f.supervisor.resources.read(f.sites.map((entry) => entry.siteId));

  await f.supervisor.resources.change({
    expectedVersion: initial.version,
    databaseCpu: 1,
    sites: [{ siteId: site.siteId, processes: 2 }, { siteId: f.sites[1]!.siteId, processes: 1 }],
  });
  await f.supervisor.close();
  const children: ReturnType<typeof fork>[] = [];
  const start = async (): Promise<{ child: ReturnType<typeof fork>; ready: ISupervisorReady }> => {
    const child = fork(new URL('../fixtures/fork-supervisor.mjs', import.meta.url), [], {
      env: {
        ...process.env,
        ZARYA_TEST_SUPERVISOR: JSON.stringify({
          settings: f.settings, budget: { ...f.budget, workerRunner: f.budget.workerRunner.href },
        }),
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });

    children.push(child);
    let diagnostics = '';

    child.stderr!.on('data', (chunk: Buffer) => {
      diagnostics += chunk.toString();
    });

    try {
      return { child, ready: supervisorReady(await workerMessage(child, 'ready')) };
    } catch (error) {
      throw new Error(diagnostics, { cause: error });
    }
  };

  try {
    const first = await start();
    const workers = first.ready.workers;

    expect(workers).toHaveLength(3);
    const exit = once(first.child, 'exit');

    first.child.kill('SIGKILL');
    await exit;
    await expect.poll(() => workers.every(({ pid }) => {
      try {
        process.kill(pid, 0);

        return false;
      } catch (error) {
        return error instanceof Error && 'code' in error && error.code === 'ESRCH';
      }
    }), { timeout: 15000 }).toBe(true);
    const second = await start();

    expect(second.ready.workers.length).toBe(3);
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({
        host: '127.0.0.1', port: second.ready.port, path: '/probe/', headers: { Host: site.host },
      }, (res) => {
        let body = '';

        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });

      req.on('error', reject);
      req.end();
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('One old');
    const allocation: { version: string } = JSON.parse(await readFile(
      path.join(f.root, 'coordination/.coordination/processes/allocation.json'), 'utf8'));

    expect(allocation.version).not.toBe(initial.version);
    const finished = once(second.child, 'exit');

    second.child.send({ kind: 'close' });
    await finished;
  } finally {
    const active = children.filter((child) => child.exitCode === null && child.signalCode === null);

    await Promise.allSettled(active.map(async (child) => {
      const exited = once(child, 'exit');

      child.kill('SIGKILL');
      await exited;
    }));
    await f.close();
  }
}, 90000);
