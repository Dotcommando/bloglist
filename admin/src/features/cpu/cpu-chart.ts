import type { ICpuChartPoint } from './cpu-telemetry.js';

/** Current samples stay at the right edge of a five-minute window. Missing time stays blank. */
export function cpuChartSegments(points: readonly ICpuChartPoint[], index: number): string[] {
  const end = Date.parse(points.at(-1)?.timestamp ?? '');
  const segments: string[] = [];
  let segment: string[] = [];
  let previous: number | null = null;
  const finish = (): void => {
    if (segment.length) {
      segments.push(segment.join(' '));
      segment = [];
    }
  };

  for (const point of points) {
    const time = Date.parse(point.timestamp);
    const value = point.usage[index];
    const x = 299 - (end - time) / 1000;

    if (previous !== null && (time - previous > 2500 || time <= previous)) {
      finish();
    }
    if (value === null || value === undefined || !Number.isFinite(x) || x < 0 || x > 299) {
      finish();
    } else {
      segment.push(`${Math.round(x * 1000) / 1000},${100 - value}`);
    }
    previous = time;
  }
  finish();

  return segments;
}
