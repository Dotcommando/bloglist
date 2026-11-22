import { createConnection, mongo } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import {
  MongooseHookConfiguration,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-configuration.adapter.js';
import {
  MongooseHookRecipientSource,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-recipient-source.adapter.js';

describe('hook recipient storage translation', () => {
  it('retains the session for configuration, versions and add-on state and propagates failures', async () => {
    const connection = createConnection();
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const configuration = new MongooseHookConfiguration(new HookPersistence(connection));
    const tree = { hooks: [], handlers: [] };

    vi.spyOn(configuration, 'tree').mockResolvedValue(tree);
    vi.spyOn(configuration, 'version').mockResolvedValue(null);
    const enabled = vi.fn(async () => true);
    const bindings = vi.fn(async () => []);
    const source = new MongooseHookRecipientSource(configuration, enabled, bindings, session);

    try {
      expect(await source.tree('site')).toBe(tree);
      expect(await source.version('site', 'v1')).toBeNull();
      expect(await source.addonEnabled('site', 'example')).toBe(true);
      expect(await source.addons('site')).toEqual([]);
      expect(configuration.tree).toHaveBeenCalledWith('site', session);
      expect(configuration.version).toHaveBeenCalledWith('site', 'v1', session);
      expect(enabled).toHaveBeenCalledWith('site', 'example', session);
      expect(bindings).toHaveBeenCalledWith('site');
      vi.mocked(configuration.version).mockRejectedValueOnce(new Error('Read unavailable'));
      await expect(source.version('site', 'v1')).rejects.toThrow('Read unavailable');
    } finally {
      await session.endSession();
      await client.close();
      await connection.close();
    }
  });
});
