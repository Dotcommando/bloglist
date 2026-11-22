import 'reflect-metadata';

import { manageDeployment } from './infra/deployment/manage-deployment.js';

await manageDeployment(process.argv.length === 3 ? process.argv[2] ?? '' : '', process.env).catch(() => {
  console.error('Deployment administration failed; verify the command, configuration, migration and delivery state.');
  process.exitCode = 1;
});
