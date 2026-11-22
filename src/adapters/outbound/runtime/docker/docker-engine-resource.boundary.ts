import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { IContainerResourceObservation } from '../../../../ports/outbound/resources/container-resources.port.js';
import { localResourceExchange, resourceRecord } from './container-resource.protocol.js';
import type { IDockerCpuLimits, IDockerResourceBoundary } from './docker-resource-control.adapter.js';

export interface IDockerResourceSettings {
  readonly dockerSocket: string;
  readonly composeProject: string;
  readonly overridePath: string;
}

export function observedContainerCpu(host: Readonly<Record<string, unknown>>): number | null {
  const quota = typeof host.NanoCpus === 'number' && host.NanoCpus > 0 ? host.NanoCpus / 1e9
    : typeof host.CpuQuota === 'number' && host.CpuQuota > 0
      && typeof host.CpuPeriod === 'number' && host.CpuPeriod > 0
      ? host.CpuQuota / host.CpuPeriod : null;

  if (host.CpusetCpus === undefined || host.CpusetCpus === '') {
    return quota;
  }
  if (typeof host.CpusetCpus !== 'string' || host.CpusetCpus.length > 16384) {
    throw new Error('Invalid managed CPU affinity');
  }

  const intervals = host.CpusetCpus.split(',').map((field) => {
    if (!/^\d+(?:-\d+)?$/.test(field)) {
      throw new Error('Invalid managed CPU affinity');
    }

    const [first, last = first] = field.split('-').map(Number);

    if (first === undefined || last === undefined || !Number.isSafeInteger(last) || last < first) {
      throw new Error('Invalid managed CPU affinity');
    }

    return { first, last };
  }).sort((a, b) => a.first - b.first);
  let count = 0;
  let previous = -1;

  for (const interval of intervals) {
    count += Math.max(0, interval.last - Math.max(previous + 1, interval.first) + 1);
    previous = Math.max(previous, interval.last);
  }

  if (count <= 0 || !Number.isSafeInteger(count)) {
    throw new Error('Invalid managed CPU affinity');
  }

  return quota === null ? count : Math.min(quota, count);
}

export class DockerEngineResourceBoundary implements IDockerResourceBoundary {
  constructor(private readonly settings: IDockerResourceSettings) {
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(settings.composeProject)) {
      throw new Error('Explicit registered Compose project required');
    }
  }

  async persist(limits: IDockerCpuLimits): Promise<void> {
    await mkdir(path.dirname(this.settings.overridePath), { recursive: true, mode: 0o700 });
    const temporary = this.settings.overridePath + '.' + randomUUID();

    await writeFile(temporary, JSON.stringify({
      services: {
        app: { cpus: limits.cmsCpu },
        mongo: { cpus: limits.databaseCpu },
      },
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, this.settings.overridePath);
  }

  async update(limits: IDockerCpuLimits): Promise<void> {
    const before = await this.inspect();
    const order = before.databaseCpu !== null && limits.databaseCpu < before.databaseCpu
      ? ['mongo', 'app'] : ['app', 'mongo'];

    for (const service of order) {
      const container = await this.container(service);
      const cpu = service === 'mongo' ? limits.databaseCpu : limits.cmsCpu;

      await localResourceExchange(this.settings.dockerSocket, '/containers/' + container.id + '/update', 'POST',
        { NanoCpus: Math.round(cpu * 1e9) });
    }
  }

  async inspect(): Promise<IContainerResourceObservation> {
    const database = await this.container('mongo');
    const cms = await this.container('app');

    return { databaseCpu: database.cpu, cmsCpu: cms.cpu, databaseImage: database.image };
  }

  private async container(service: string): Promise<{ readonly id: string;
    readonly cpu: number | null;
    readonly image: string }> {
    const labels = [
      'com.docker.compose.project=' + this.settings.composeProject,
      'com.docker.compose.service=' + service,
    ];
    const filters = encodeURIComponent(JSON.stringify({ label: labels, status: ['running'] }));
    const matches: unknown = await localResourceExchange(this.settings.dockerSocket,
      '/containers/json?filters=' + filters, 'GET');

    if (!Array.isArray(matches) || matches.length !== 1) {
      throw new Error('Registered managed container is unavailable or ambiguous');
    }

    const id = resourceRecord(matches[0]).Id;

    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) {
      throw new Error('Invalid managed container identity');
    }

    const record = resourceRecord(await localResourceExchange(this.settings.dockerSocket,
      '/containers/' + id + '/json', 'GET'));
    const config = resourceRecord(record.Config);
    const observedLabels = resourceRecord(config.Labels);

    if (
      observedLabels['com.docker.compose.project'] !== this.settings.composeProject
      || observedLabels['com.docker.compose.service'] !== service
      || typeof config.Image !== 'string'
    ) {
      throw new Error('Managed container registration mismatch');
    }

    const host = resourceRecord(record.HostConfig);

    return { id, cpu: observedContainerCpu(host), image: config.Image };
  }
}
