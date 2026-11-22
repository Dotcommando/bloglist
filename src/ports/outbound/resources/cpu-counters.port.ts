export interface ICpuCounters {
  readonly timestamp: string;
  readonly monotonicMs: number;
  readonly source: string;
  readonly cores: readonly { readonly idle: number; readonly total: number }[];
}

export interface ICpuCountersPort {
  read(): Promise<ICpuCounters>;
}

export interface ICpuLoadSample {
  readonly timestamp: string;
  readonly source: string;
  readonly logicalCpuCount: number;
  readonly intervalMs: number | null;
  readonly usage: readonly (number | null)[];
}

export interface ICpuTelemetrySubscriber {
  authorize(): Promise<void>;
  send(sample: ICpuLoadSample): void;
  close(): void;
}
