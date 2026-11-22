import { type IActivePublication, ReleaseState } from '../../../../../domain/publication/publication-release.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { requireCondition } from '../../../../../domain/shared/validation.js';
import type { IPublicationStorePort } from '../../../../../ports/outbound/publication/publication-store.port.js';
import type {
  IActivateReleaseInput,
  IReleaseActivationPort,
} from '../../../../../ports/outbound/publication/release-activation.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import type { IPublicationModels } from './publication.models.js';

export class MongooseReleaseActivationAdapter implements IReleaseActivationPort {
  constructor(private readonly models: IPublicationModels, private readonly store: IPublicationStorePort,
    private readonly hookEvents?: MongooseHookEvents) {}

  async getActive(siteId: string): Promise<IActivePublication | null> {
    const record = await this.models.active.findOne({ _id: siteId, siteId }).lean().exec();

    return record ? { siteId: record._id, releaseId: record.releaseId, activatedAt: record.activatedAt } : null;
  }

  async findActivation(siteId: string, releaseId: string): Promise<IActivePublication | null> {
    const record = await this.models.activations.findOne({
      _id: releaseId,
      siteId,
    }).readConcern('majority').lean().exec();

    return record ? { siteId: record.siteId, releaseId: record._id, activatedAt: record.activatedAt } : null;
  }

  async activate(input: IActivateReleaseInput): Promise<IActivePublication> {
    const release = await this.store.read(input.siteId, input.releaseId);

    requireCondition(release !== null && release.siteId === input.siteId && release.releaseId === input.releaseId
      && release.state === ReleaseState.Ready, 'Only an owned Ready release can be activated');
    const session = await this.models.connection.startSession();

    try {
      for (let attempt = 0; ; attempt++) {
        let committing = false;

        try {
          session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const current = await this.models.active.findOne({ _id: input.siteId, siteId: input.siteId })
            .session(session).lean().exec();

          if ((current?.releaseId ?? null) !== input.expectedActiveReleaseId) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Active publication changed');
          }

          const fields = { releaseId: input.releaseId, activatedAt: input.activatedAt };

          if (current) {
            const result = await this.models.active.updateOne({
              _id: input.siteId,
              siteId: input.siteId,
              releaseId: current.releaseId,
            }, { $set: fields }, { session }).exec();

            if (result.matchedCount !== 1) {
              throw new BusinessError(BusinessErrorCode.StaleWrite, 'Active publication changed');
            }
          } else {
            await this.models.active.insertOne({ _id: input.siteId, siteId: input.siteId, ...fields }, { session });
          }
          await this.models.activations.insertOne({
            _id: input.releaseId,
            siteId: input.siteId,
            activatedAt: input.activatedAt,
          }, { session });
          await recordHookChange(this.hookEvents, input.hookChange, session);
          committing = true;
          await session.commitTransaction();

          return { siteId: input.siteId, ...fields };
        } catch (error) {
          if (!committing) {
            // Replay only confirmed aborted transactions; keep the original active-release guard.
            const aborted = await session.abortTransaction().then(() => true, () => false);

            if (aborted && error instanceof Error && 'code' in error && error.code === 112 && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
              continue;
            }
            if (error instanceof Error && 'code' in error && [11000, 112].includes(Number(error.code))) {
              throw new BusinessError(BusinessErrorCode.StaleWrite, 'Concurrent release activation');
            }
          }
          throw error;
        }
      }
    } finally {
      await session.endSession();
    }
  }
}
