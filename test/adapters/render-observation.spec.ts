import { describe, expect, it } from 'vitest';

import { RenderObservationAdapter } from '../../src/adapters/outbound/diagnostics/render-observation.adapter.js';
import { RenderStage, StageOutcome } from '../../src/domain/diagnostics/page-resolution.js';

describe('bounded render observations', () => {
  it('closes unfinished stages as failures instead of zero-duration success', async () => {
    let now = 0;
    const observation = new RenderObservationAdapter(() => now);
    const trace = observation.create();

    await observation.run(trace, async () => {
      observation.start(RenderStage.Composition);
      now = 5;
    });
    await observation.waitForCompletion(trace);
    expect(trace.stages).toEqual([
      {
        id: 1,
        parentId: null,
        stage: RenderStage.Composition,
        offsetMs: 0,
        durationMs: 5,
        outcome: StageOutcome.Failure,
      },
    ]);
  });
  it('correlates nested intervals without including sink work', async () => {
    let now = 0;
    const observation = new RenderObservationAdapter(() => now);
    const trace = observation.create();

    await observation.run(trace, () => observation.measure(RenderStage.Runtime, async () => {
      now = 2;
      await observation.measure(RenderStage.Snippet, async () => {
        now = 7;
      });
      now = 10;
    }));
    expect(trace.stages).toEqual([
      { id: 1, parentId: null, stage: RenderStage.Runtime, offsetMs: 0, durationMs: 10, outcome: StageOutcome.Success },
      { id: 2, parentId: 1, stage: RenderStage.Snippet, offsetMs: 2, durationMs: 5, outcome: StageOutcome.Success },
    ]);
  });

  it('bounds stages and does not change a failing operation', async () => {
    const observation = new RenderObservationAdapter(() => 0);
    const trace = observation.create();
    const failure = new Error('private failure');

    await observation.run(trace, async () => {
      for (let index = 0; index < 260; index++) {
        observation.sync(RenderStage.Input, () => undefined);
      }
      await expect(observation.measure(RenderStage.Runtime, async () => {
        throw failure;
      })).rejects.toBe(failure);
    });
    expect(trace.stages).toHaveLength(256);
    expect(trace.droppedStages).toBe(5);
    expect(JSON.stringify(trace)).not.toContain('private failure');
  });
});
