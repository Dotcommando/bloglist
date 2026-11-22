import { createConnection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { MongooseAddonUpdateGate }
  from '../../src/adapters/outbound/persistence/mongoose/addons/addon-update-gate.adapter.js';

describe('add-on update gate', () => {
  it('denies reads while an incompatible update is paused', async () => {
    const gate = new MongooseAddonUpdateGate(createConnection());

    vi.spyOn(gate.model.collection, 'findOne').mockResolvedValue({ paused: true });
    await expect(gate.requireActive('synthetic')).rejects.toMatchObject({ code: 'AddonUnavailable' });
  });

  it('allows an installed add-on without a previous update record', async () => {
    const gate = new MongooseAddonUpdateGate(createConnection());

    vi.spyOn(gate.model.collection, 'findOne').mockResolvedValue(null);
    await expect(gate.requireActive('synthetic')).resolves.toBeUndefined();
  });
});
