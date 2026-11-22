import type { IPageResolutionObservation } from '../../../domain/diagnostics/page-resolution.js';
import {
  PageDelivery, RenderStage, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation, StageOutcome,
} from '../../../domain/diagnostics/page-resolution.js';
import type { IRecordPageResolution } from '../../../ports/inbound/diagnostics/record-page-resolution.port.js';
import type { IPageResolutionWriter } from '../../../ports/outbound/diagnostics/page-resolution-store.port.js';

export class RecordPageResolutionUseCase implements IRecordPageResolution {
  constructor(private readonly writer: IPageResolutionWriter, private readonly cmsVersion: string) {
    if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(cmsVersion)) {
      throw new Error('Invalid CMS version');
    }
  }

  async execute(input: IPageResolutionObservation): Promise<void> {
    const finite = (value: number): boolean => Number.isFinite(value) && value >= 0;

    if (
      !input.siteId.trim()
      || input.siteId.length > 128
      || !input.path.startsWith('/')
      || input.path.startsWith('//')
      || input.path.length > 4096
      || /[?#]/.test(input.path)
      || Array.from(input.path).some((character) => character.charCodeAt(0) < 32)
      || !Number.isFinite(input.startedAt.getTime())
      || !finite(input.durationMs)
      || !finite(input.completionMs)
      || input.completionMs < input.durationMs
      || !Number.isInteger(input.statusCode)
      || input.statusCode < 100
      || input.statusCode > 599
      || !Object.values(ResolutionMethod).includes(input.method)
      || !Object.values(ResolutionRepresentation).includes(input.representation)
      || !Object.values(PageDelivery).includes(input.delivery)
|| !Object.values(ResolutionOutcome).includes(input.outcome)
      || !Number.isInteger(input.droppedStages)
      || input.droppedStages < 0
      || input.stages.length > 256
    ) {
      throw new Error('Invalid page resolution observation');
    }

    const ids = new Set<number>();

    for (const stage of input.stages) {
      if (
        !Number.isInteger(stage.id)
        || stage.id < 1
        || ids.has(stage.id)
        || stage.parentId !== null
        && !ids.has(stage.parentId)
        || !Object.values(RenderStage).includes(stage.stage)
        || !Object.values(StageOutcome).includes(stage.outcome)
        || !finite(stage.offsetMs)
        || !finite(stage.durationMs)
      ) {
        throw new Error('Invalid render stage observation');
      }
      ids.add(stage.id);
    }
    await this.writer.append({ ...input, cmsVersion: this.cmsVersion });
  }
}
