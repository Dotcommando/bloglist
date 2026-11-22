import type { ICpuTelemetrySubscriber } from '../../outbound/resources/cpu-counters.port.js';

export interface ICpuTelemetry {
  subscribe(subscriber: ICpuTelemetrySubscriber): () => void;
  close(): void;
}
