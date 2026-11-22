import { type AdminLanguage, formatMessage, messagesFor } from '../../i18n/catalog.js';
import { type IResourceView, ResourceDatabasePlacement } from '../resources/resources-api.js';

export interface ICalibrationCapabilities {
  readonly processSupervisor: boolean;
  readonly externalGenerator: boolean;
}

export enum CalibrationBlocker {
  Supervisor = 'Supervisor',
  Control = 'Control',
  Generator = 'Generator',
  Helper = 'Helper',
  Quotas = 'Quotas',
  Pools = 'Pools',
  Application = 'Application',
  Dump = 'Dump',
  Workers = 'Workers',
}

export interface ICalibrationBlocker {
  readonly code: CalibrationBlocker;
  readonly reason: string;
  readonly action: string;
}

/** Explain observed prerequisites; missing observations never imply a known deployment type. */
export function calibrationBlockers(resources: IResourceView | null,
  capabilities: ICalibrationCapabilities | null, language: AdminLanguage): readonly ICalibrationBlocker[] {
  if (!resources || !capabilities) {
    return [];
  }

  const copy = messagesFor(language);
  const blockers: ICalibrationBlocker[] = [];
  const add = (code: CalibrationBlocker, reason: string, action: string): void => {
    blockers.push({ code, reason, action });
  };
  const docker = copy.calibrationAvailabilityStopTheCurrentHTTPApplication;

  if (!capabilities.processSupervisor) {
    add(CalibrationBlocker.Supervisor, copy.calibrationAvailabilityTheCMSProcessSupervisorIs, docker);

    return blockers;
  }
  if (!resources.managed) {
    const reason = resources.databasePlacement === ResourceDatabasePlacement.Remote
      ? (copy.calibrationAvailabilityTheDatabaseIsRemoteIts)
      : resources.databasePlacement === ResourceDatabasePlacement.UnmanagedLocal
        ? (copy.calibrationAvailabilityTheLocalDatabaseIsNot)
        : (copy.calibrationAvailabilityCMSIsNotConnectedTo);

    add(CalibrationBlocker.Control, reason,
      resources.databasePlacement === ResourceDatabasePlacement.ManagedLocal ? docker
        : copy.calibrationAvailabilityASharedDatabaseCMSBudget);
  } else if (!resources.databaseImage) {
    add(CalibrationBlocker.Helper, copy.calibrationAvailabilityCouldNotReadContainerState,
      copy.calibrationAvailabilityCheckThatResourceControlIs);
  } else if (
    resources.observedCmsCpu === null
    || resources.observedDatabaseCpu === null
    || Math.abs(resources.observedCmsCpu - resources.cmsCpu) > 1e-8
    || Math.abs(resources.observedDatabaseCpu - resources.databaseCpu) > 1e-8
  ) {
    add(CalibrationBlocker.Quotas, copy.calibrationAvailabilityActualDatabaseAndCMSCPU,
      copy.calibrationAvailabilityCheckActualQuotasInGeneral);
  }
  if (resources.managed && !capabilities.externalGenerator) {
    add(CalibrationBlocker.Generator, copy.calibrationAvailabilityTheLoadGeneratorSharesThe,
      copy.calibrationAvailabilityStartASeparateResourceControl);
  }
  if (!resources.databasePools?.editable) {
    add(CalibrationBlocker.Pools, copy.calibrationAvailabilityTheSiteProcessConnectionPool,
      copy.calibrationAvailabilityStartTheCMSWithIts);
  }
  if (resources.applyError) {
    add(CalibrationBlocker.Application, copy.calibrationAvailabilityThePreviousResourceAllocationWas,
      copy.calibrationAvailabilityResolveTheApplicationErrorAnd);
  }
  if (resources.activeDump) {
    add(CalibrationBlocker.Dump, copy.calibrationAvailabilityADumpOperationIsActive,
      copy.calibrationAvailabilityWaitForTheOperationIn);
  }
  if (resources.sites.some(site => site.error || site.running !== site.processes)) {
    add(CalibrationBlocker.Workers, copy.calibrationAvailabilityNotAllAssignedSiteProcesses,
      copy.calibrationAvailabilityCheckStartupErrorsAndRunning);
  }

  return blockers;
}

export function calibrationAvailabilityReadError(status: number, language: AdminLanguage): string {
  const copy = messagesFor(language);
  const http = status > 0 ? ' (HTTP ' + status + ')' : '';

  return formatMessage(copy.calibrationAvailabilityCouldNotCheckCalibrationAvailability, { http });
}
