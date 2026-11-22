import { describe, expect, it, type Mock, vi } from 'vitest';

import {
  CreateCalibrationProfileUseCase,
} from '../../src/app/use-cases/calibration/create-calibration-profile.use-case.js';
import { CalibrationPageReferenceKind, CalibrationScope, type ICalibrationProfileDraft } from
  '../../src/domain/calibration/calibration-profile.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../src/ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ICalibrationProfilesPort } from '../../src/ports/outbound/calibration/calibration-profiles.port.js';
import type { ICalibrationValuesPort } from '../../src/ports/outbound/calibration/calibration-profiles.port.js';
import type { ISiteResourceCatalogPort } from '../../src/ports/outbound/resources/site-resource-catalog.port.js';
import { currentAdmin } from '../support/current-admin.js';

function draft(): ICalibrationProfileDraft {
  return {
    name: 'Home traffic',
    scope: CalibrationScope.Site,
    siteId: 'one',
    distributedCpu: 4,
    targets: [{ siteId: 'one', kind: CalibrationPageReferenceKind.RelativeUrl, reference: '/', share: 10000 }],
    criteria: { averageMs: null, medianMs: null, p95Ms: 600, p99Ms: null },
    search: {
      concurrencyLevels: [1, 4, 16, 64],
      processCounts: [1, 2, 4],
      poolSizes: [1, 5, 10],
      databaseCpuStep: 0.1,
      warmupSeconds: 5,
      probeSeconds: 15,
      confirmationSeconds: 60,
      maximumSeconds: 900,
    },
  };
}

function fixture(): {
  store: ICalibrationProfilesPort;
  current: { execute: Mock<IGetCurrentAdminUser['execute']> };
  sites: ISiteResourceCatalogPort;
  values: ICalibrationValuesPort;
  create: CreateCalibrationProfileUseCase;
} {
  const store: ICalibrationProfilesPort = {
    create: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    replace: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const current = { execute: vi.fn<IGetCurrentAdminUser['execute']>(async () => currentAdmin()) };
  const sites = {
    list: vi.fn(async () => [{ siteId: 'one', name: 'One', primaryDomain: 'one.test' },
      { siteId: 'two', name: 'Two', primaryDomain: 'two.test' }]),
  };
  const values = { now: () => new Date('2026-11-15T12:00:00Z'), nextId: () => 'profile', nextVersion: () => 'v1' };

  return { store, current, sites, values, create: new CreateCalibrationProfileUseCase(store, current, sites, values) };
}

describe('create calibration profile', () => {
  it('stores an exact traffic mix and retains an empty percentage as a zero-share page', async () => {
    const f = fixture();
    const input = draft();
    const saved = await f.create.execute({
      token: 'valid',
      draft: {
        ...input,
        targets: [...input.targets,
          { siteId: 'one', kind: CalibrationPageReferenceKind.PageNumber, reference: '12' }],
      },
    });

    expect(saved.targets.map(target => target.share)).toEqual([10000, 0]);
    expect(saved).toMatchObject({ profileId: 'profile', version: 'v1', deletedAt: null });
    expect(saved.criteria.p95Ms).toBe(600);
    expect(f.store.create).toHaveBeenCalledExactlyOnceWith(saved);
  });

  it('accepts hundredths exactly and rejects an over-allocated traffic distribution', async () => {
    const f = fixture();
    const input = draft();
    const targets = [
      { ...input.targets[0]!, share: 9999 },
      { siteId: 'one', kind: CalibrationPageReferenceKind.PageNumber, reference: '12', share: 1 },
    ];

    expect((await f.create.execute({ token: 'valid', draft: { ...input, targets } })).targets).toEqual(targets);
    vi.mocked(f.store.create).mockClear();
    await expect(f.create.execute({
      token: 'valid',
      draft: {
        ...input, targets: targets.map(target => ({ ...target, share: target.share + 1 })),
      },
    })).rejects.toMatchObject({ code: BusinessErrorCode.Validation });
    expect(f.store.create).not.toHaveBeenCalled();
  });

  it('rejects a foreign site in a site-scoped profile even for a zero-share row', async () => {
    const f = fixture();
    const input = draft();

    await expect(f.create.execute({
      token: 'valid',
      draft: {
        ...input,
        targets: [
          ...input.targets, { siteId: 'two', kind: CalibrationPageReferenceKind.RelativeUrl, reference: '/', share: 0 },
        ],
      },
    })).rejects.toMatchObject({ code: BusinessErrorCode.Validation });
    expect(f.store.create).not.toHaveBeenCalled();
  });

  it('authenticates before site enumeration or persistence', async () => {
    const f = fixture();

    f.current.execute.mockRejectedValue(new BusinessError(BusinessErrorCode.AuthenticationRequired,
      'Session required'));
    await expect(f.create.execute({ token: null, draft: draft() }))
      .rejects.toMatchObject({ code: BusinessErrorCode.AuthenticationRequired });
    expect(f.sites.list).not.toHaveBeenCalled();
    expect(f.store.create).not.toHaveBeenCalled();
  });
});
