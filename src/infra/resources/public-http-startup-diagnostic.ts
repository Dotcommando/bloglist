import { LocalSiteListenerError } from '../../adapters/inbound/gateway/http/local-site-listener.error.js';
import { migrationFailureDiagnostic } from '../persistence/migration-diagnostic.js';

export function publicHttpStartupDiagnostic(error: unknown): string {
  if (error instanceof LocalSiteListenerError) {
    return `Zarya HTTP startup failed: cannot open local site address ${error.origin}. `
      + 'Check that its port is available and loopback binding is permitted. Startup was cancelled.';
  }

  const migration = migrationFailureDiagnostic(error);

  if (migration) {
    return migration;
  }
  if (error instanceof Error) {
    if ('code' in error && error.code === 'EADDRINUSE') {
      return 'Zarya public HTTP startup failed: the configured HTTP port is already in use. '
        + 'Stop the other CMS instance, including the Docker app, before starting from the IDE or PowerShell.';
    }
    if (
      error.message === 'Another CMS supervisor is running'
      || 'code' in error
      && ['EBUSY', 'EACCES', 'EPERM', 'EEXIST'].some((code) => code === error.code)
      && 'path' in error
      && typeof error.path === 'string'
      && /(?:^|[\\/])supervisor\.pid$/.test(error.path)
    ) {
      return 'Zarya public HTTP startup failed: the CMS coordination file is in use or inaccessible. '
        + 'Stop the other CMS instance, including the Docker app, before starting from the IDE or PowerShell. '
        + 'If no other instance is running, check private storage permissions.';
    }
  }

  return 'Zarya public HTTP startup failed. Verify HTTP settings, MongoDB, migrations and artifact storage.';
}
