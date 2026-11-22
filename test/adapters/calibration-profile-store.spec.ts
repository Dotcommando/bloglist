import { createConnection } from 'mongoose';
import { expect, it, vi } from 'vitest';

import { type ICalibrationProfileRecord, MongooseCalibrationProfiles } from
  '../../src/adapters/outbound/persistence/mongoose/calibration/calibration-profiles.adapter.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { calibrationProfile } from '../support/calibration.js';

it('maps opaque identifiers, dates and retained zero traffic without exposing persistence fields', async () => {
  const connection = createConnection();
  const store = new MongooseCalibrationProfiles(connection);
  const model = connection.model<ICalibrationProfileRecord>('CalibrationProfile');
  const profile = calibrationProfile();
  const insert = vi.spyOn(model, 'insertOne').mockImplementation(async document => new model(document));

  try {
    await store.create(profile);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ _id: 'profile', version: 'v1' }));
    const query = model.findOne({});
    const { profileId, ...fields } = profile;

    vi.spyOn(query, 'exec').mockResolvedValue(new model({ ...fields, _id: profileId }));
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const loaded = await store.get('profile');

    expect(loaded).toEqual(profile);
    expect(loaded).not.toHaveProperty('_id');
    expect(loaded).not.toHaveProperty('$__');
    expect(loaded?.createdAt).toBeInstanceOf(Date);
  } finally {
    await connection.close();
  }
});

it('translates concurrent replacement and deletion failures into stale writes', async () => {
  const connection = createConnection();
  const store = new MongooseCalibrationProfiles(connection);
  const model = connection.model<ICalibrationProfileRecord>('CalibrationProfile');
  const replace = model.replaceOne({}, {});
  const remove = model.updateOne({}, {});

  vi.spyOn(replace, 'exec').mockResolvedValue({
    acknowledged: true,
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0,
    upsertedId: null,
  });
  vi.spyOn(remove, 'exec').mockResolvedValue({
    acknowledged: true,
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0,
    upsertedId: null,
  });
  vi.spyOn(model, 'replaceOne').mockReturnValue(replace);
  vi.spyOn(model, 'updateOne').mockReturnValue(remove);

  try {
    await expect(store.replace(calibrationProfile(), 'older'))
      .rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
    await expect(store.remove('profile', 'older', new Date()))
      .rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
  } finally {
    await connection.close();
  }
});
