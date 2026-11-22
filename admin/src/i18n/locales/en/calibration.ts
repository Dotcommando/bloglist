export default {
  calibrationAvailabilityStopTheCurrentHTTPApplication:
    'Stop the current HTTP application and start the CMS and resource helper containers '
    + '(resource-control) using the installation’s Docker configuration. Then press Refresh.',
  calibrationAvailabilityTheCMSProcessSupervisorIs: 'The CMS process supervisor is not running.',
  calibrationAvailabilityTheDatabaseIsRemoteIts:
    'The database is remote: its CPU quota is not managed by this installation.',
  calibrationAvailabilityTheLocalDatabaseIsNot: 'The local database is not connected to CPU quota control.',
  calibrationAvailabilityCMSIsNotConnectedTo: 'CMS is not connected to Docker CPU quota control.',
  calibrationAvailabilityASharedDatabaseCMSBudget:
    'A shared database/CMS budget requires a managed local database and CMS in Docker. '
    + 'Configure that deployment and press Refresh.',
  calibrationAvailabilityCouldNotReadContainerState: 'Could not read container state from the Docker resource helper.',
  calibrationAvailabilityCheckThatResourceControlIs:
    'Check that resource-control is running and can access Docker and the CMS private '
    + 'socket. Restore the connection and press Refresh.',
  calibrationAvailabilityActualDatabaseAndCMSCPU:
    'Actual database and CMS CPU quotas do not confirm the saved allocation.',
  calibrationAvailabilityCheckActualQuotasInGeneral:
    'Check actual quotas in General → Resources, apply the allocation through the Docker '
    + 'helper and press Refresh.',
  calibrationAvailabilityTheLoadGeneratorSharesThe: 'The load generator shares the CMS CPU quota.',
  calibrationAvailabilityStartASeparateResourceControl:
    'Start a separate resource-control container outside the CMS quota, connect it to the '
    + 'CMS and press Refresh.',
  calibrationAvailabilityTheSiteProcessConnectionPool: 'The site-process connection pool cannot be changed.',
  calibrationAvailabilityStartTheCMSWithIts: 'Start the CMS with its fork process supervisor, then press Refresh.',
  calibrationAvailabilityThePreviousResourceAllocationWas: 'The previous resource allocation was not fully applied.',
  calibrationAvailabilityResolveTheApplicationErrorAnd:
    'Resolve the application error and verify actual state in General → Resources, then '
    + 'press Refresh.',
  calibrationAvailabilityADumpOperationIsActive: 'A dump operation is active.',
  calibrationAvailabilityWaitForTheOperationIn: 'Wait for the operation in Dumps to finish and press Refresh.',
  calibrationAvailabilityNotAllAssignedSiteProcesses: 'Not all assigned site processes are ready.',
  calibrationAvailabilityCheckStartupErrorsAndRunning:
    'Check startup errors and running process counts in General → Resources. Wait for '
    + 'readiness and press Refresh.',
  calibrationAvailabilityCouldNotCheckCalibrationAvailability:
    'Could not check calibration availability{http}. Check the connection to the CMS and '
    + 'press Refresh. The blocking condition has not been determined.',
  calibrationAddonsAddOnsDuringMeasurement: 'Add-ons during measurement',
  calibrationAddonsNoEnabledAddOns: 'no enabled add-ons',
  calibrationAddonsThisHistoricalRunHasNo: 'This historical run has no add-on snapshot. Recalibration is required.',
  calibrationApiStepsPublicGETAfterPage: 'Public GET after page',
  calibrationApiStepsUnavailable: 'unavailable',
  calibrationApiStepsRemoveStep: 'Remove step',
  calibrationApiStepsPublicAPI: '+ Public API',
  calibrationHistoryApplication: 'Application:',
  calibrationHistoryDatabase: 'Database:',
  calibrationHistoryDatabasePoolPerProcess: 'Database pool per process:',
  calibrationHistoryGeneratorConnections: 'Generator connections:',
  calibrationHistoryLastCalibrations: 'Last 10 calibrations',
  calibrationHistoryCompletingARunLeavesPersistent:
    'Completing a run leaves persistent settings unchanged. Apply saves the measured '
    + 'configuration.',
  calibrationHistoryNoRetainedRunsYet: 'No retained runs yet.',
  calibrationHistoryMeasured: 'Measured',
  calibrationHistoryProfileStatus: 'Profile / status',
  calibrationHistoryReference: 'Reference',
  calibrationHistoryResult: 'Result',
  calibrationHistoryLegacyFixedResourcesCPUBudget: 'Legacy: fixed resources, CPU budget not enforced',
  calibrationHistoryTotalBudget: 'total budget',
  calibrationHistoryAddOnCompositionChangedOr: 'Add-on composition changed or was not recorded. Recalibrate.',
  calibrationHistoryDetails: 'Details',
  calibrationHistoryApply: 'Apply',
  calibrationHistoryFillResourceForm: 'Fill resource form',
  calibrationHistoryOriginalSettingsRestored: 'Original settings restored:',
  calibrationHistoryTypeDate: 'Type / date',
  calibrationHistoryConfiguration: 'Configuration',
  calibrationHistoryMean: 'Mean',
  calibrationHistoryMedian: 'Median',
  calibrationHistoryErrorsPass: 'Errors / pass',
  calibrationHistoryBySite: 'By site',
  calibrationHistoryHide: 'Hide',
  calibrationHistoryApplyingSettings: 'Applying settings…',
  calibrationHistoryRequestFailedRefreshTheState: 'Request failed. Refresh the state before retrying.',
  calibrationHistoryProcess: 'process',
  calibrationHistoryProcesses: 'processes',
  calibrationHistoryProcesses2: 'processes',
  calibrationHistoryRunning: 'Running',
  calibrationHistoryCompleted: 'Completed',
  calibrationHistoryCancelled: 'Cancelled',
  calibrationHistoryFailed: 'Failed',
  calibrationHistoryInterruptedByRestart: 'Interrupted by restart',
  calibrationHistoryRestorationRequired: 'Restoration required',
  calibrationHistoryCalibrationResultApplied: 'Calibration result applied.',
  calibrationMetricsTableMean: 'Mean:',
  calibrationMetricsTableMedian: 'Median:',
  calibrationMetricsTableRequests: 'Requests:',
  calibrationMetricsTableErrors: 'Errors:',
  calibrationShareInputDecreaseShareBy: 'Decrease share by 1%',
  calibrationShareInputIncreaseShareBy: 'Increase share by 1%',
  calibrationStepMetricsScenarioRequests: 'Scenario requests',
  calibrationCalibrationTemporarilyChangesResourcesAnd:
    'Calibration temporarily changes resources and generates HTTP traffic. The site remains '
    + 'live; external traffic affects measurements. Original settings are restored after the '
    + 'run.',
  calibrationCheckingCalibrationAvailability: 'Checking calibration availability…',
  calibrationCalibrationUnavailable: 'Calibration unavailable',
  calibrationCreateProfile: 'Create profile',
  calibrationProfiles: 'Profiles',
  calibrationEditProfile: 'Edit profile',
  calibrationNewProfile: 'New profile',
  calibrationProfileName: 'Profile name',
  calibrationTotalDatabaseAndCMSCPU: 'Total database and CMS CPU budget',
  calibrationSearchesDatabaseAndCMSCPU:
    'Searches database and CMS CPU quotas within the shared budget, connection pool size '
    + 'and process counts for every site. Actual Docker quotas are verified before '
    + 'measurement.',
  calibrationThisLegacyProfileMeasuredProcesses:
    'This legacy profile measured processes only. All sites are now included; set shares '
    + 'and save the profile.',
  calibrationPagesAndTrafficShares: 'Pages and traffic shares',
  calibrationEnterAURLRelativePath:
    'Enter a URL, relative path or numeric page ID. Positive shares totaling below 100% are '
    + 'normalized proportionally at run time. Blank shares are retained as 0%.',
  calibrationAddPage: 'Add page',
  calibrationShare: 'Share, %',
  calibrationPageShare: 'Page share ',
  calibrationRemovePageFromProfile: 'Remove page from profile',
  calibrationRemovePageRow: 'Remove page row ',
  calibrationAssignPositiveTrafficToThis: 'Assign positive traffic to this site before starting.',
  calibrationTotalShare: 'Total share:',
  calibrationMaximumWithPrecision: 'maximum 100%, with 0.01% precision.',
  calibrationLatencyLimitsMs: 'Latency limits, ms',
  calibrationABlankFieldDisablesThat:
    'A blank field disables that criterion. Every enabled criterion must pass for every site.',
  calibrationSearchRangesAndExperimentTiming: 'Search ranges and experiment timing',
  calibrationTheseAreSearchParametersNot:
    'These are search parameters, not CMS limits. Generator HTTP concurrency increases '
    + 'until a criterion fails. The result is the best confirmed configuration within the '
    + 'selected ranges and time budget.',
  calibrationProcessCountCandidatesCommaSeparated: 'Process count candidates, comma separated',
  calibrationGeneratorConcurrencyLevels: 'Generator concurrency levels',
  calibrationPoolSizeCandidatesCommaSeparated: 'Pool size candidates, comma separated',
  calibrationDatabaseCPUStep: 'Database CPU step',
  calibrationWarmupSeconds: 'Warmup, seconds',
  calibrationProbeSeconds: 'Probe, seconds',
  calibrationConfirmationSeconds: 'Confirmation, seconds',
  calibrationTotalRunBudgetSeconds: 'Total run budget, seconds',
  calibrationSaveProfile: 'Save profile',
  calibrationStartCalibration: 'Start calibration',
  calibrationDeleteProfile: 'Delete profile',
  calibrationCurrentRun: 'Current run',
  calibrationRetainedMeasurements: 'Retained measurements:',
  calibrationStopAndRestoreSettings: 'Stop and restore settings',
  calibrationApplyingChanges: 'Applying changes…',
  calibrationDeleteProfile2: 'Delete profile?',
  calibrationMeasurementHistoryWillBeRetained: 'Measurement history will be retained.',
  calibrationParametersRejectedCheckTheProfile:
    'Parameters rejected. Check the profile, published pages and supported calibration mode.',
  calibrationStateChangedOrAnotherOperation: 'State changed or another operation is active. Refresh the data.',
  calibrationRequestDidNotCompleteRefresh:
    'Request did not complete. Refresh the state: the operation may have succeeded.',
  calibrationProfileSaved: 'Profile saved.',
  calibrationMeasurementsSavedAndOriginalSettings:
    'Measurements saved and original settings restored. The resource form will receive the '
    + 'recommendation; press Save allocation to apply it.',
};
