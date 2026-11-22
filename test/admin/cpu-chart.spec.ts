import { cpuChartSegments } from '../../admin/src/features/cpu/cpu-chart.js';

it('anchors the current sample at the right edge and places older measurements to its left', () => {
  expect(cpuChartSegments([
    { timestamp: '2026-11-13T12:00:00.000Z', usage: [25] },
    { timestamp: '2026-11-13T12:00:01.000Z', usage: [50] },
  ], 0)).toEqual(['298,75 299,50']);
});

it('leaves missing samples and delayed intervals as gaps instead of joining them', () => {
  expect(cpuChartSegments([
    { timestamp: '2026-11-13T12:00:00.000Z', usage: [25] },
    { timestamp: '2026-11-13T12:00:01.000Z', usage: [null] },
    { timestamp: '2026-11-13T12:00:02.000Z', usage: [50] },
    { timestamp: '2026-11-13T12:00:07.000Z', usage: [75] },
  ], 0)).toEqual(['292,75', '294,50', '299,25']);
});
