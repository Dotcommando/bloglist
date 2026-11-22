import { readLocalSettings } from './infra/local-application.settings.js';
import { migrationFailureDiagnostic } from './infra/persistence/migration-diagnostic.js';
import { runMigrations } from './infra/persistence/run-migrations.js';

try {
  if (process.argv.slice(2).some((argument) => argument !== '--verify')) {
    throw new Error('Unsupported migration argument');
  }
  await runMigrations(readLocalSettings(process.env), process.argv.includes('--verify'));
  console.info('Zarya migrations verified.');
} catch (error) {
  console.error(migrationFailureDiagnostic(error)
    ?? 'Zarya migration failed. Check local settings and schema/checksum compatibility.');
  process.exitCode = 1;
}
