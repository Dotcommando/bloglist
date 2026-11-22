import type { IContainerResourceObservation, IContainerResourcesPort } from
  '../../../../ports/outbound/resources/container-resources.port.js';

export interface IDockerCpuLimits {
  readonly databaseCpu: number;
  readonly cmsCpu: number;
}

export interface IDockerResourceBoundary {
  persist(limits: IDockerCpuLimits): Promise<void>;
  update(limits: IDockerCpuLimits): Promise<void>;
  inspect(): Promise<IContainerResourceObservation>;
}

export class DockerResourceControlAdapter implements IContainerResourcesPort {
  private active = false;

  constructor(private readonly budget: { readonly capacity: number; readonly infrastructureCpu: number },
    private readonly boundary: IDockerResourceBoundary) {}

  observe(): Promise<IContainerResourceObservation> {
    return this.boundary.inspect();
  }

  async apply(limits: IDockerCpuLimits): Promise<IContainerResourceObservation> {
    const values = [limits.databaseCpu, limits.cmsCpu];
    const shared = this.budget.capacity <= 1 && values.every((value) => value <= this.budget.capacity);

    if (
      this.active
      || values.some((value) => !Number.isFinite(value) || value <= 0
      || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8)
      || !shared
      && limits.databaseCpu + limits.cmsCpu + this.budget.infrastructureCpu > this.budget.capacity + 1e-8
    ) {
      throw new Error('Invalid or concurrent container CPU allocation');
    }
    this.active = true;

    try {
      await this.boundary.persist(limits);
      await this.boundary.update(limits);
      const observed = await this.boundary.inspect();

      if (
        observed.databaseCpu === null
        || observed.cmsCpu === null
        || Math.abs(observed.databaseCpu - limits.databaseCpu) > 1e-8
        || Math.abs(observed.cmsCpu - limits.cmsCpu) > 1e-8
      ) {
        throw new Error('Container CPU settings did not match the desired configuration');
      }

      return observed;
    } finally {
      this.active = false;
    }
  }
}
