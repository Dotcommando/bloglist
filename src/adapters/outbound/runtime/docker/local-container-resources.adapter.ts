import type { IContainerResourceObservation, IContainerResourcesPort } from
  '../../../../ports/outbound/resources/container-resources.port.js';
import { localResourceExchange, resourceObservation } from './container-resource.protocol.js';

export class LocalContainerResourcesAdapter implements IContainerResourcesPort {
  constructor(private readonly socketPath: string, private readonly secret: string) {}

  async observe(): Promise<IContainerResourceObservation> {
    return resourceObservation(await localResourceExchange(this.socketPath, '/limits', 'GET', undefined, this.secret));
  }

  async apply(input: { readonly databaseCpu: number; readonly cmsCpu: number }):
  Promise<IContainerResourceObservation> {
    return resourceObservation(await localResourceExchange(this.socketPath, '/limits', 'PUT', input, this.secret));
  }
}
