export function assertRoutingTopology(hello: unknown): void {
  if (
    hello === null
    || typeof hello !== 'object'
    || !('logicalSessionTimeoutMinutes' in hello)
    || typeof hello.logicalSessionTimeoutMinutes !== 'number'
    || hello.logicalSessionTimeoutMinutes <= 0
    || !(('setName' in hello && typeof hello.setName === 'string' && hello.setName.length > 0)
      || ('msg' in hello && hello.msg === 'isdbgrid'))
  ) {
    throw new Error('Transactional routing requires a replica set or sharded MongoDB with session support');
  }
}
