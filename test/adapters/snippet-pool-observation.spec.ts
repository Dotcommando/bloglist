import { RenderObservationAdapter } from '../../src/adapters/outbound/diagnostics/render-observation.adapter.js';
import { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { RenderStage } from '../../src/domain/diagnostics/page-resolution.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';

it('attributes reused Worker callbacks to the current request instead of the first trace', async () => {
  const pool = new SnippetWorkerPool();
  const observation = new RenderObservationAdapter();

  try {
    const traces = [];

    for (let index = 0; index < 2; index++) {
      const trace = observation.create();

      traces.push(trace);
      await observation.run(trace, () => pool.execute('async function __snippet() { return "ok"; }', {}, {
        siteId: 'site-' + index,
        pageId: 'page',
        language: 'en',
        phase: LoaderPhase.Request,
        preview: false,
        signal: AbortSignal.timeout(5000),
      }, observation));
      await observation.waitForCompletion(trace);
    }
    expect(pool.snapshot().created).toBe(1);

    for (const trace of traces) {
      expect(trace.stages.filter((stage) => stage.stage === RenderStage.Script)).toHaveLength(1);
      expect(trace.stages.filter((stage) => stage.stage === RenderStage.WorkerStartup)).toHaveLength(1);
      expect(trace.stages.filter((stage) => stage.stage === RenderStage.Transfer)).toHaveLength(1);
    }
  } finally {
    await pool.onModuleDestroy();
  }
});
