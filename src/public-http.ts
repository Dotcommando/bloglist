import { readPublicHttpSettings } from './infra/public-http.settings.js';
import { httpReadyMessage } from './infra/resources/http-ready-message.js';
import { createProcessSupervisor } from './infra/resources/process-supervisor.js';
import { readProcessSupervisorSettings } from './infra/resources/process-supervisor.settings.js';
import { publicHttpStartupDiagnostic } from './infra/resources/public-http-startup-diagnostic.js';

try {
  const settings = readPublicHttpSettings(process.env);
  const application = await createProcessSupervisor(settings,
    await readProcessSupervisorSettings(process.env));

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void application.close().catch(() => {
        process.exitCode = 1;
      });
    });
  }
  const address = application.server.address();

  if (!address || typeof address === 'string') {
    await application.close();
    throw new Error('HTTP listener address is unavailable');
  }
  console.info(httpReadyMessage({
    elapsedMs: process.uptime() * 1000,
    address,
    administrationOrigin: settings.adminAuth?.origin ?? null,
    sites: application.startupSites,
  }));
} catch (error) {
  console.error(publicHttpStartupDiagnostic(error));
  process.exitCode = 1;
}
