import { createConnection, Query } from 'mongoose';

import {
  deploymentSchema, MongooseDeploymentStore,
} from '../../src/adapters/outbound/persistence/mongoose/deployment/deployment-store.adapter.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

describe('deployment store boundary', () => {
  const exec = vi.fn();
  const connection = createConnection();
  const model = connection.model('DeploymentTarget', deploymentSchema);

  vi.spyOn(Query.prototype, 'exec').mockImplementation(exec);
  vi.spyOn(model, 'findOne');
  vi.spyOn(model, 'replaceOne');
  const create = vi.spyOn(model, 'create');

  beforeEach(() => {
    vi.clearAllMocks();
    exec.mockReset();
    create.mockReset();
  });

  it('scopes reads by site and keeps database identifiers out of the result', async () => {
    const fixture = deploymentFixture();

    exec.mockResolvedValue({ _id: fixture.target.targetId, ...fixture });
    expect(await new MongooseDeploymentStore(connection).get(fixture.siteId)).toEqual(fixture);
    expect(model.findOne).toHaveBeenCalledWith({ siteId: fixture.siteId });
  });

  it('compares the stored version and target identity without upserting a stale replacement', async () => {
    const fixture = deploymentFixture();
    const store = new MongooseDeploymentStore(connection);

    exec.mockResolvedValue({ matchedCount: 0 });
    await expect(store.save(fixture, 'previous')).rejects.toMatchObject({ code: 'StaleWrite' });
    expect(vi.mocked(model.replaceOne).mock.calls[0]?.[0]).toEqual({
      _id: fixture.target.targetId,
      siteId: fixture.siteId,
      version: 'previous',
    });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('translates a concurrent first configuration into StaleWrite', async () => {
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 }));

    await expect(new MongooseDeploymentStore(connection).save(deploymentFixture(), null))
      .rejects.toMatchObject({ code: 'StaleWrite' });
  });

  it('validates safe staged diagnostics and rejects arbitrary provider details', () => {
    const fixture = deploymentFixture();
    const diagnostic = {
      issue: 'Backend',
      retryable: false,
      stage: 'PublicVerification',
      reason: 'HttpStatus',
      httpStatus: 400,
      recovery: 'CheckBackendAndReconcile',
    };

    expect(new model({ _id: fixture.target.targetId, ...fixture, diagnostic }).validateSync()).toBeUndefined();
    expect(new model({
      _id: fixture.target.targetId, ...fixture, diagnostic: { ...diagnostic, httpStatus: 999 },
    }).validateSync()).toBeDefined();
    expect(new model({
      _id: fixture.target.targetId, ...fixture, diagnostic: { ...diagnostic, providerBody: 'secret' },
    }).validateSync()).toBeDefined();
  });

  it('rejects a foreign target before persistence', async () => {
    const fixture = deploymentFixture();

    await expect(new MongooseDeploymentStore(connection).save({
      ...fixture,
      target: { ...fixture.target, siteId: 'foreign-site' },
    }, null)).rejects.toThrow();
    expect(model.create).not.toHaveBeenCalled();
    expect(model.replaceOne).not.toHaveBeenCalled();
  });
});
