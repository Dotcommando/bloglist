import type { IncomingMessage, ServerResponse } from 'node:http';

import { requireInstallationAdministrator } from '../../../../domain/admin-users/admin-user.policy.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  ICreateCalibrationProfile, IDeleteCalibrationProfile, IGetCalibrationProfile, IListCalibrationProfiles,
  IUpdateCalibrationProfile,
} from '../../../../ports/inbound/calibration/calibration-profiles.port.js';
import type { IApplyCalibrationResult, ICancelCalibrationRun, IReadCalibrationRuns, IStartCalibrationRun } from
  '../../../../ports/inbound/calibration/calibration-runs.port.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson } from
  '../shared/admin-http.boundary.js';
import { calibrationDraftDto } from './calibration-profile.dto.js';

export interface ICalibrationRunOperations {
  readonly start: IStartCalibrationRun;
  readonly read: IReadCalibrationRuns;
  readonly cancel: ICancelCalibrationRun;
  readonly apply: IApplyCalibrationResult;
  readonly full: boolean;
}

export class AdminCalibrationController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly create: ICreateCalibrationProfile, private readonly get: IGetCalibrationProfile,
    private readonly list: IListCalibrationProfiles, private readonly update: IUpdateCalibrationProfile,
    private readonly remove: IDeleteCalibrationProfile,
    private readonly operations: ICalibrationRunOperations | null = null) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return pathname.split('?')[0]?.startsWith('/api/admin/installation/calibration/') ?? false;
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const path = this.boundary.check(request, response).split('?')[0];
      const token = this.boundary.token(request);

      requireInstallationAdministrator((await this.current.execute({ token })).user);

      if (path === '/api/admin/installation/calibration/capabilities') {
        this.boundary.method(request, response, 'GET');
        sendJson(response, 200, { site: this.operations !== null, installation: this.operations?.full ?? false });

        return;
      }
      if (path?.startsWith('/api/admin/installation/calibration/runs')) {
        if (!this.operations) {
          throw new HttpFailure(503, 'Calibration requires the process supervisor');
        }

        const parts = path.slice('/api/admin/installation/calibration/runs'.length).split('/').filter(Boolean);

        if (request.method === 'GET') {
          sendJson(response, 200, parts.length === 1
            ? await this.operations.read.detail({ token, runId: parts[0]! })
            : parts.length === 0 ? await this.operations.read.execute({
              token,
              siteId: new URL(request.url!, this.boundary.origin).searchParams.get('siteId'),
            })
              : (() => {
                throw new HttpFailure(404, 'Not found');
              })());

          return;
        }
        this.boundary.method(request, response, 'POST');
        const body = await readAdminBody(request, 8192);

        if (parts.length === 0) {
          if (
            Object.keys(body).some(key => !['profileId', 'expectedVersion'].includes(key))
            || typeof body.profileId !== 'string'
            || typeof body.expectedVersion !== 'string'
            || body.profileId.length > 128
            || body.expectedVersion.length > 128
          ) {
            throw new HttpFailure(400, 'Expected calibration profile and version');
          }
          sendJson(response, 202, await this.operations.start.execute({
            token, profileId: body.profileId, expectedVersion: body.expectedVersion,
          }));
        } else if (parts.length === 2 && parts[1] === 'cancel' && Object.keys(body).length === 0) {
          await this.operations.cancel.execute({ token, runId: parts[0]! });
          sendJson(response, 200, { cancelled: true });
        } else if (
          parts.length === 2
          && parts[1] === 'apply'
          && typeof body.expectedVersion === 'string'
          && body.expectedVersion.length <= 128
          && Object.keys(body).length === 1
        ) {
          sendJson(response, 200, await this.operations.apply.execute({
            token, runId: parts[0]!, expectedVersion: body.expectedVersion,
          }));
        } else {
          throw new HttpFailure(400, 'Invalid calibration operation');
        }

        return;
      }
      if (path === '/api/admin/installation/calibration/profiles') {
        if (request.method === 'GET') {
          const query = new URL(request.url!, this.boundary.origin).searchParams;

          sendJson(response, 200, await this.list.execute({
            token,
            siteId: query.get('siteId'),
            cursor: query.get('cursor'),
            limit: Number(query.get('limit') ?? '20'),
          }));

          return;
        }
        this.boundary.method(request, response, 'POST');
        const body = await readAdminBody(request, 65536);

        sendJson(response, 201, await this.create.execute({ token, draft: calibrationDraftDto(body) }));
      } else if (path && /^\/api\/admin\/installation\/calibration\/profiles\/[a-zA-Z0-9-]{1,128}$/.test(path)) {
        const profileId = path.split('/').at(-1)!;

        if (request.method === 'GET') {
          sendJson(response, 200, await this.get.execute({ token, profileId }));

          return;
        }
        if (request.method !== 'PUT' && request.method !== 'DELETE') {
          throw new HttpFailure(405, 'Method not allowed');
        }

        const body = await readAdminBody(request, 65536);
        const expectedVersion = body.expectedVersion;

        if (
          typeof expectedVersion !== 'string'
          || expectedVersion.length > 128
          || Object.keys(body).some(key => !['expectedVersion', 'draft'].includes(key))
        ) {
          throw new HttpFailure(400, 'Expected calibration version');
        }
        if (request.method === 'DELETE') {
          await this.remove.execute({ token, profileId, expectedVersion });
          sendJson(response, 200, { deleted: true });
        } else {
          sendJson(response, 200, await this.update.execute({
            token,
            profileId,
            expectedVersion,
            draft: calibrationDraftDto(body.draft),
          }));
        }
      } else {
        throw new HttpFailure(404, 'Not found');
      }
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
