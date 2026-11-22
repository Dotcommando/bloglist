import os from 'node:os';

import type { ICpuCounters, ICpuCountersPort } from '../../../../ports/outbound/resources/cpu-counters.port.js';

export class OsCpuCountersAdapter implements ICpuCountersPort {
  async read(): Promise<ICpuCounters> {
    const cpus = os.cpus();

    if (!cpus.length || cpus.length > 2048) {
      throw new Error('CPU counter source is unavailable or unsupported');
    }

    return {
      timestamp: new Date().toISOString(),
      monotonicMs: performance.now(),
      source: process.platform === 'win32' ? 'Windows host' : 'Host/Linux VM',
      cores: cpus.map((cpu) => ({ idle: cpu.times.idle, total: Object.values(cpu.times).reduce((a, b) => a + b, 0) })),
    };
  }
}
