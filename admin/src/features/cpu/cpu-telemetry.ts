import { writable } from 'svelte/store';

export interface ICpuChartPoint {
  readonly timestamp: string;
  readonly usage: readonly (number | null)[];
}

export interface ICpuChartState {
  readonly source: string;
  readonly logicalCpuCount: number;
  readonly points: readonly ICpuChartPoint[];
  readonly live: boolean;
}

const initial: ICpuChartState = { source: '', logicalCpuCount: 0, points: [], live: false };

export const cpuCharts = writable<ICpuChartState>(initial);

/** Owned by the authenticated app shell; navigation never restarts this connection. */
export function startCpuTelemetry(): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let lastArrival = 0;
  const stale = setInterval(() => {
    if (performance.now() - lastArrival > 2500) {
      cpuCharts.update((value) => ({ ...value, live: false }));
    }
  }, 1000);

  function connect(): void {
    if (stopped) {
      return;
    }

    const url = new URL('/api/admin/installation/cpu', window.location.href);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url);
    socket.onopen = () => {
      cpuCharts.set(initial);
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 65536) {
          throw new Error('Invalid CPU sample');
        }

        const sample: unknown = JSON.parse(event.data);

        if (
          !sample
          || typeof sample !== 'object'
          || !('timestamp' in sample)
          || typeof sample.timestamp !== 'string'
          || !Number.isFinite(Date.parse(sample.timestamp))
          || !('source' in sample)
          || typeof sample.source !== 'string'
          || !('logicalCpuCount' in sample)
          || typeof sample.logicalCpuCount !== 'number'
          || !Number.isInteger(sample.logicalCpuCount)
          || sample.logicalCpuCount < 0
          || sample.logicalCpuCount > 2048
          || !('usage' in sample)
          || !Array.isArray(sample.usage)
          || sample.usage.length !== sample.logicalCpuCount
        ) {
          throw new Error('Invalid CPU sample');
        }

        const usage: (number | null)[] = sample.usage.map((value: unknown) => {
          if (value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
            return value;
          }
          throw new Error('Invalid CPU usage');
        });

        lastArrival = performance.now();
        const timestamp = sample.timestamp;
        const source = sample.source;
        const logicalCpuCount = sample.logicalCpuCount;

        cpuCharts.update((value) => ({
          source,
          logicalCpuCount,
          live: usage.some((point) => point !== null),
          points: [...(value.logicalCpuCount === logicalCpuCount && value.source === source ? value.points : []),
            { timestamp, usage }].slice(-300),
        }));
      } catch {
        socket?.close();
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      cpuCharts.update((value) => ({ ...value, live: false }));

      if (!stopped) {
        reconnect = setTimeout(connect, 2000);
      }
    };
  }
  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnect);
    clearInterval(stale);
    socket?.close();
    cpuCharts.set(initial);
  };
}
