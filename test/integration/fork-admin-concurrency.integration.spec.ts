import { expect, it } from 'vitest';

import { account } from '../support/admin-users.js';
import { forkHarness } from '../support/fork-harness.js';

it('admits one concurrent admin save and rejects stale retries', async () => {
  const f = await forkHarness({ admin: true });

  try {
    const login = await fetch(f.origin + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: f.origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account().profile().email, password: 'synthetic fork password' }),
    });

    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
    const state = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));
    const requests = [2, 3].map((processes) => ({
      expectedVersion: state.version,
      databaseCpu: state.databaseCpu,
      sites: state.sites.map((site, index) => ({ ...site, processes: index === 0 ? processes : 1 })),
    }));
    const send = (input: typeof requests[number]): Promise<Response> =>
      fetch(f.origin + '/api/admin/installation/resources', {
        method: 'POST',
        headers: { Origin: f.origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(input),
      });
    const results = await Promise.allSettled(requests.map(send));
    const replies = results.map((result) => {
      if (result.status === 'rejected') {
        throw result.reason;
      }

      return result.value;
    });

    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
    const winner = replies.findIndex((reply) => reply.status === 200);
    const saved = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));

    expect(saved.sites).toEqual(requests[winner]!.sites);
    expect(saved.running[requests[winner]!.sites[0]!.siteId]).toBe(requests[winner]!.sites[0]!.processes);
    expect(saved.applyError).toBeNull();
    expect((await send(requests[1 - winner]!)).status).toBe(409);
    const unchanged = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));

    expect(unchanged.version).toBe(saved.version);
    expect(unchanged.running).toEqual(saved.running);

    for (const reply of replies) {
      await reply.arrayBuffer();
    }
  } finally {
    await f.close();
  }
}, 90000);
