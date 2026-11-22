import { createLocalApplication } from './infra/local-application.js';
import { readLocalSettings } from './infra/local-application.settings.js';

try {
  const application = await createLocalApplication(readLocalSettings(process.env));

  application.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  console.info('Zarya local application context is ready.');
} catch {
  console.error('Zarya startup failed. Verify explicit local settings, MongoDB availability and applied migrations.');
  process.exitCode = 1;
}
