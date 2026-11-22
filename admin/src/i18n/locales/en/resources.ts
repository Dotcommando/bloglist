export default {
  resourceProcessesTotalCMSProcesses: 'Total CMS processes:',
  resourceProcessesSites: 'sites:',
  resourceProcessesServices: 'services:',
  resourceProcessesDumps: 'dumps:',
  resourceProcessesAwaitingAPID: 'Awaiting a PID:',
  resourceProcessesCMSProcesses: 'CMS processes',
  resourceProcessesRole: 'Role',
  resourceProcessesState: 'State',
  resourceProcessesStartingAndDrainingProcessesAre:
    'Starting and draining processes are included. Replacements temporarily increase the '
    + 'process count.',
  resourceProcessesProcessInventoryUnavailable: 'Process inventory unavailable.',
  resourceProcessesCoordinator: 'Coordinator',
  resourceProcessesAdministrationAndBackgroundWork: 'Administration and background work',
  resourceProcessesDumpCapture: 'Dump capture',
  resourceProcessesStarting: 'Starting',
  resourceProcessesReady: 'Ready',
  resourceProcessesDraining: 'Draining',
  resourceSettingsInstallationResources: 'Installation resources',
  resourceSettingsSharedCMSCPUQuotaAfter: 'Shared CMS CPU quota after saving:',
  resourceSettingsInstallation: 'Installation',
  resourceSettingsInfrastructureReserve: 'Infrastructure reserve:',
  resourceSettingsActualDatabaseCPUQuota: 'Actual database CPU quota:',
  resourceSettingsDockerControlIsUnavailableThe: 'Docker control is unavailable. The database quota is read-only.',
  resourceSettingsTheDatabaseIsRemoteIts: 'The database is remote. Its CPU is not deducted from the CMS budget.',
  resourceSettingsTheLocalDatabaseIsManaged:
    'The local database is managed separately. CMS uses its configured deployment CPU budget.',
  resourceSettingsMongoDBConnections: 'MongoDB connections',
  resourceSettingsMaximumConnectionsPerSiteProcess: 'Maximum connections per site process',
  resourceSettingsSaved: 'Saved:',
  resourceSettingsAppliedToAllSiteProcesses: 'Applied to all site processes:',
  resourceSettingsServicePoolPerProcessCoordinator: 'Service pool per process (coordinator and administration):',
  resourceSettingsConfiguredAtStartup: '(configured at startup).',
  resourceSettingsPoolsOpenConnectionsOnDemand:
    'Pools open connections on demand. Each process has separate pools for database nodes; '
    + 'MongoDB monitoring connections are separate. Applying the setting replaces site '
    + 'processes one at a time, starting each new process before stopping its predecessor.',
  resourceSettingsAllCMSProcesses: 'All CMS processes',
  resourceSettingsSharedCPUQuotaForAll: 'Shared CPU quota for all processes:',
  resourceSettingsOSProcessesNotCPUCores: 'OS processes, not CPU cores: all share this quota.',
  resourceSettingsAddOns: 'Add-ons:',
  resourceSettingsProcessesForThisSite: 'Processes for this site',
  resourceSettingsSiteAssigned: 'Site: assigned',
  resourceSettingsRunningNow: 'running now',
  resourceSettingsOneProcessIsTemporarilyLent: 'One process is temporarily lent to dump capture and will be restored.',
  resourceSettingsThisSiteIsCreatingA: 'This site is creating a dump.',
  resourceSettingsSomeAssignedProcessesCouldNot:
    'Some assigned processes could not start. Compare the saved and running counts.',
  resourceSettingsSiteProcessesOnly: 'Site processes only',
  resourceSettingsAssignedToSites: 'Assigned to sites:',
  resourceSettingsRunningForSites: 'Running for sites:',
  resourceSettingsEnteredValuesNotAppliedYet: 'Entered values · not applied yet',
  resourceSettingsCPURecommendation: 'CPU recommendation',
  resourceSettingsSiteProcessesInTheForm: 'Site processes in the form:',
  resourceSettingsCPUGuidelineForSiteProcesses: 'CPU guideline for site processes:',
  resourceSettingsUnallocatedCPUBudget: 'Unallocated CPU budget:',
  resourceSettingsTheDatabaseAndSitesShare: 'The database and sites share one CPU. Allocation cannot be changed.',
  resourceSettingsWhenYouCreateASite:
    'When you create a site dump in production via Settings → Dumps → Create dump, this '
    + 'resource allocation behaves as follows:',
  resourceSettingsAfterApplyingTheEnteredValues: 'After applying the entered values:',
  resourceSettingsOneSiteProcessWillStop:
    'One site process will stop for dump capture. The remaining processes keep serving. The '
    + 'serving process is restored afterwards.',
  resourceSettingsSingleProcessCapture:
    'Capture runs in the only site process. The site can temporarily stall.',
  resourceSettingsRequestedProcessesTotalRecommendedBy:
    'Requested processes: {total}; recommended by CPU: {recommendation}. You may exceed the '
    + 'CPU recommendation. This is not recommended: processes will compete for the shared CPU '
    + 'budget.',
  resourceSettingsNoUnsavedChanges: 'No unsaved changes',
  resourceSettingsAllocationSaved: 'Allocation saved',
  resourceSettingsSaveAllocation: 'Save allocation',
  resourceSettingsTheSavedAllocationIsNot:
    'The saved allocation is not fully applied. Actual quotas and running processes are '
    + 'shown above.',
  resourceSettingsApplyingAllocation: 'Applying allocation…',
  resourceSettingsCouldNotRefreshTheActual: 'Could not refresh the actual resource state.',
  resourceSettingsAllocationSavedAssignedAndRunning:
    'Allocation saved. Assigned and running processes are shown above.',
  resourceSettingsSaveResponseTimedOutChanges:
    'Save response timed out. Changes may have applied. Refreshing the actual state.',
  resourceSettingsAllocationRejectedCheckCPUQuotas: 'Allocation rejected. Check CPU quotas and process counts.',
  resourceSettingsSaveRejectedAllocationChangedOr:
    'Save rejected: allocation changed or another operation is active. Refresh before '
    + 'trying again.',
  resourceSettingsCouldNotFinishApplyingThe: 'Could not finish applying the allocation. Check the current state above.',
  resourceSettingsSaveConfirmedAllAssignedProcesses: 'Save confirmed. All assigned processes are running.',
  resourceSettingsSaveOrDiscardYourCurrent: 'Save or discard your current edits before filling the recommendation.',
  resourceSettingsCalibrationResultFilledPressSave: 'Calibration result filled. Press Save allocation to apply it.',
};
