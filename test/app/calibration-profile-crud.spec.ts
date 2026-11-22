import { expect, it, vi } from 'vitest';

import {
  DeleteCalibrationProfileUseCase,
  GetCalibrationProfileUseCase,
  ListCalibrationProfilesUseCase,
  UpdateCalibrationProfileUseCase,
} from '../../src/app/use-cases/calibration/calibration-profiles.use-case.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { ICalibrationProfilesPort } from '../../src/ports/outbound/calibration/calibration-profiles.port.js';
import { calibrationDraft, calibrationProfile } from '../support/calibration.js';
import { currentAdmin } from '../support/current-admin.js';

const current = { execute: async () => currentAdmin() };

const values = { now: () => new Date('2026-11-15T13:00:00Z'), nextId: () => 'unused', nextVersion: () => 'v2' };

const sites = { list: async () => [{ siteId: 'one', name: 'One', primaryDomain: 'one.test' }] };

function store(): ICalibrationProfilesPort {
  return {
    create: vi.fn(),
    get: vi.fn(async () => calibrationProfile()),
    list: vi.fn(async () => ({ items: [calibrationProfile()], nextCursor: null })),
    replace: vi.fn(),
    remove: vi.fn(),
  };
}

it('reads retained profiles and returns not found for deleted/missing profiles', async () => {
  const profiles = store();
  const get = new GetCalibrationProfileUseCase(profiles, current);

  expect(await get.execute({ token: 'valid', profileId: 'profile' })).toEqual(calibrationProfile());
  vi.mocked(profiles.get).mockResolvedValue(null);
  await expect(get.execute({ token: 'valid', profileId: 'profile' }))
    .rejects.toMatchObject({ code: BusinessErrorCode.NotFound });
});

it('lists only the requested site and installation profiles with bounded pagination', async () => {
  const profiles = store();
  const list = new ListCalibrationProfilesUseCase(profiles, current);

  await list.execute({ token: 'valid', siteId: 'one', cursor: null, limit: 20 });
  expect(profiles.list).toHaveBeenCalledWith({ siteId: 'one', cursor: null, limit: 20 });
  await expect(list.execute({ token: 'valid', siteId: 'one', cursor: null, limit: 101 }))
    .rejects.toMatchObject({ code: BusinessErrorCode.Validation });
});

it('updates with optimistic concurrency, retaining creation time and zero rows', async () => {
  const profiles = store();
  const update = new UpdateCalibrationProfileUseCase(profiles, current, sites, values);
  const saved = await update.execute({
    token: 'valid',
    profileId: 'profile',
    expectedVersion: 'v1',
    draft: { ...calibrationDraft(), name: 'Changed' },
  });

  expect(saved).toMatchObject({
    version: 'v2',
    name: 'Changed',
    createdAt: calibrationProfile().createdAt,
    updatedAt: values.now(),
  });
  expect(profiles.replace).toHaveBeenCalledWith(saved, 'v1');
  await expect(update.execute({
    token: 'valid',
    profileId: 'profile',
    expectedVersion: 'old',
    draft: calibrationDraft(),
  })).rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
});

it('soft deletes with expected version and leaves run history independent', async () => {
  const profiles = store();

  await new DeleteCalibrationProfileUseCase(profiles, current, values)
    .execute({ token: 'valid', profileId: 'profile', expectedVersion: 'v1' });
  expect(profiles.remove).toHaveBeenCalledExactlyOnceWith('profile', 'v1', values.now());
  expect(profiles.replace).not.toHaveBeenCalled();
});
