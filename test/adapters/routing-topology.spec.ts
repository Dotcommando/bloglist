import { assertRoutingTopology } from '../../src/adapters/outbound/persistence/mongoose/routing/routing-topology.js';

describe('transactional routing deployment', () => {
  it('rejects a standalone or sessionless database instead of degrading routing writes', () => {
    expect(() => assertRoutingTopology({ isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 })).toThrow();
    expect(() => assertRoutingTopology({ setName: 'rs' })).toThrow();
  });

  it('accepts explicit replica sets and sharded routing with sessions', () => {
    expect(() => assertRoutingTopology({ setName: 'zarya-rs', logicalSessionTimeoutMinutes: 30 })).not.toThrow();
    expect(() => assertRoutingTopology({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30 })).not.toThrow();
  });
});
