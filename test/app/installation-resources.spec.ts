import { expect, it, vi } from 'vitest';

import { ChangeInstallationResourcesUseCase, GetInstallationResourcesUseCase } from
  '../../src/app/use-cases/resources/installation-resources.use-case.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../src/ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IInstallationResourcesPort } from '../../src/ports/outbound/resources/installation-resources.port.js';
import { currentAdmin } from '../support/current-admin.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

function fixture(): {
  current: IGetCurrentAdminUser;
  sites: FakeSiteRepository;
  resources: IInstallationResourcesPort;
  read: GetInstallationResourcesUseCase;
  change: ChangeInstallationResourcesUseCase;
} {
  const current: IGetCurrentAdminUser = { execute: vi.fn(async () => currentAdmin()) };
  const sites = new FakeSiteRepository();

  sites.records.set('a', siteFixture('a', 'A', 'a.localhost'));
  const resources: IInstallationResourcesPort = {
    read: vi.fn(async () => ({
      version: 'v1',
      capacity: 3,
      logicalCpuCount: 3,
      databaseCpu: 1,
      databasePools: { sitePoolSize: 5, appliedSitePoolSize: 5, coordinatorPoolSize: 5, editable: true },
      infrastructureCpu: 0,
      cmsCpu: 2,
      databasePlacement: DatabasePlacement.ManagedLocal,
      sites: [{ siteId: 'a', processes: 1 }],
      activeDump: false,
      managed: true,
      databaseEngine: 'MongoDB',
      databaseVersion: 'test',
      databaseImage: null,
      observedDatabaseCpu: null,
      observedCmsCpu: null,
      applyError: null,
      running: { a: 1 },
      processErrors: { a: null },
    })),
    change: vi.fn(async () => {}),
  };

  return {
    current,
    sites,
    resources,
    read: new GetInstallationResourcesUseCase(resources, { list: () => sites.findAll() }, current),
    change: new ChangeInstallationResourcesUseCase(resources, { list: () => sites.findAll() }, current),
  };
}

it('authenticates before reading resources and describes the actual site dump mode', async () => {
  const f = fixture();
  const view = await f.read.execute({ token: 'session' });

  expect(view.unallocated).toBe(1);
  expect(view.recommendation).toBe(2);
  expect(view.siteDetails[0]).toMatchObject({ name: 'Example', dumpMode: 'InProcess' });
  vi.mocked(f.current.execute).mockRejectedValueOnce(new Error('unauthorized'));
  vi.mocked(f.resources.read).mockClear();
  await expect(f.read.execute({ token: null })).rejects.toThrow('unauthorized');
  expect(f.resources.read).not.toHaveBeenCalled();
});

it('accepts 22 processes without an invented memory or connection admission limit', async () => {
  const f = fixture();
  const state = await f.resources.read(['a']);

  vi.mocked(f.resources.read).mockResolvedValueOnce(state);
  await expect(f.change.execute({
    token: 'session',
    expectedVersion: 'v1',
    databaseCpu: 1.4,
    sites: [{ siteId: 'a', processes: 22 }],
  })).resolves.toBeDefined();
  expect(f.resources.change).toHaveBeenCalledWith({
    expectedVersion: 'v1',
    databaseCpu: 1.4,
    sites: [{ siteId: 'a', processes: 22 }],
  });
});

it.each([1, 2])('changes the site database pool on %i CPUs without changing the fixed allocation', async (capacity) => {
  const f = fixture();
  const state = await f.resources.read(['a']);

  vi.mocked(f.resources.read).mockResolvedValue({
    ...state,
    capacity,
    databasePools: { sitePoolSize: 5, appliedSitePoolSize: 5, coordinatorPoolSize: 5, editable: true },
  });
  await f.change.execute({
    token: 'session',
    expectedVersion: 'v1',
    databaseCpu: 1,
    sites: [{ siteId: 'a', processes: 1 }],
    sitePoolSize: 3,
  });
  expect(f.resources.change).toHaveBeenCalledWith(expect.objectContaining({ sitePoolSize: 3 }));
});

it.each([0, -1, 1.5, Number.NaN])('rejects an invalid site database pool size %s before applying', async (size) => {
  const f = fixture();

  await expect(f.change.execute({
    token: 'session',
    expectedVersion: 'v1',
    databaseCpu: 1,
    sites: [{ siteId: 'a', processes: 1 }],
    sitePoolSize: size,
  })).rejects.toThrow();
  expect(f.resources.change).not.toHaveBeenCalled();
});

it('rejects stale edits and foreign allocations before applying changes', async () => {
  const f = fixture();

  for (const input of [
    { expectedVersion: 'old', databaseCpu: 1, sites: [{ siteId: 'a', processes: 1 }] },
    { expectedVersion: 'v1', databaseCpu: 1, sites: [{ siteId: 'b', processes: 1 }] },
  ]) {
    await expect(f.change.execute({ token: 'session', ...input })).rejects.toThrow();
  }
  expect(f.resources.change).not.toHaveBeenCalled();
});

it('allows additional processes above the recommendation and accepts fractional DB quotas', async () => {
  const f = fixture();

  await f.change.execute({
    token: 'session',
    expectedVersion: 'v1',
    databaseCpu: 1.4,
    sites: [{ siteId: 'a', processes: 4 }],
  });
  expect(f.resources.change).toHaveBeenCalledOnce();
});

it('allows a second serving process on two local CPUs when the database is remote', async () => {
  const f = fixture();
  const state = await f.resources.read(['a']);

  vi.mocked(f.resources.read).mockResolvedValue({
    ...state, capacity: 2, cmsCpu: 2, databaseCpu: 0, managed: false, databasePlacement: DatabasePlacement.Remote,
  });
  const view = await f.read.execute({ token: 'session' });

  expect(view.allocationEditable).toBe(true);
  await f.change.execute({
    token: 'session', expectedVersion: 'v1', databaseCpu: 0, sites: [{ siteId: 'a', processes: 2 }],
  });
  expect(f.resources.change).toHaveBeenCalledOnce();
});

it.each(['restricted', 'blocked'])('denies resource access for an unauthorized %s profile', async (profile) => {
  for (const action of ['read', 'processes', 'pool', 'database']) {
    const f = fixture();
    const admin = currentAdmin();
    const list = vi.spyOn(f.sites, 'findAll');

    vi.mocked(f.current.execute).mockResolvedValue({
      ...admin,
      user: {
        ...admin.user,
        blocked: profile === 'blocked',
        ...(profile === 'restricted'
          ? { authorization: { systemAdmin: false, siteIds: ['a'], siteAdminSiteIds: ['a'] } }
          : {}),
      },
    });
    const operation = action === 'read' ? f.read.execute({ token: 'session' }) : f.change.execute({
      token: 'session',
      expectedVersion: 'v1',
      databaseCpu: action === 'database' ? 1.4 : 1,
      sites: [{ siteId: 'a', processes: action === 'processes' ? 2 : 1 }],
      ...(action === 'pool' ? { sitePoolSize: 7 } : {}),
    });

    await expect(operation).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    expect(list).not.toHaveBeenCalled();
    expect(f.resources.read).not.toHaveBeenCalled();
    expect(f.resources.change).not.toHaveBeenCalled();
  }
});

it.each([null, 'forged', 'expired', 'revoked'])('rejects invalid session %s before resource work', async (token) => {
  for (const action of ['read', 'write']) {
    const f = fixture();
    const list = vi.spyOn(f.sites, 'findAll');

    vi.mocked(f.current.execute).mockRejectedValue(
      new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Session required'),
    );
    const operation = action === 'read' ? f.read.execute({ token }) : f.change.execute({
      token, expectedVersion: 'v1', databaseCpu: 1.4, sitePoolSize: 7, sites: [{ siteId: 'a', processes: 2 }],
    });

    await expect(operation).rejects.toMatchObject({ code: BusinessErrorCode.AuthenticationRequired });
    expect(list).not.toHaveBeenCalled();
    expect(f.resources.read).not.toHaveBeenCalled();
    expect(f.resources.change).not.toHaveBeenCalled();
  }
});

it('preserves the explicit calibrated CMS quota when saving an edited resource form', async () => {
  const f = fixture();

  await f.change.execute({
    token: 'session',
    expectedVersion: 'v1',
    databaseCpu: 1,
    cmsCpu: 1,
    sites: [{ siteId: 'a', processes: 2 }],
  });
  expect(f.resources.change).toHaveBeenCalledWith(expect.objectContaining({ cmsCpu: 1 }));
});

it.each([0, -1, 3, Number.NaN])('rejects invalid or excessive explicit CMS quota %s', async cmsCpu => {
  const f = fixture();

  await expect(f.change.execute({
    token: 'session',
    expectedVersion: 'v1',
    databaseCpu: 1,
    cmsCpu,
    sites: [{ siteId: 'a', processes: 1 }],
  })).rejects.toMatchObject({ code: BusinessErrorCode.Validation });
  expect(f.resources.change).not.toHaveBeenCalled();
});
