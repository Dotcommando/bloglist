import {
  type IInstallationProcess, InstallationProcessRole, InstallationProcessState,
} from '../../../../domain/resources/installation-process.js';

export function readInstallationProcesses(value: unknown): readonly IInstallationProcess[] {
  if (!Array.isArray(value)) {
    throw new RangeError('Invalid installation processes');
  }

  return value.map((entry: unknown) => {
    if (
      !entry
      || typeof entry !== 'object'
      || !('pid' in entry)
      || !('siteId' in entry)
      || !('role' in entry)
      || !('state' in entry)
    ) {
      throw new RangeError('Invalid installation process');
    }

    const role = Object.values(InstallationProcessRole).find(role => role === entry.role);
    const state = Object.values(InstallationProcessState).find(state => state === entry.state);

    if (
      !role
      || !state
      || entry.pid !== null
      && (typeof entry.pid !== 'number'
      || !Number.isSafeInteger(entry.pid)
      || entry.pid < 1)
      || entry.siteId !== null
      && typeof entry.siteId !== 'string'
    ) {
      throw new RangeError('Invalid installation process state');
    }

    return { pid: entry.pid, siteId: entry.siteId, role, state };
  });
}
