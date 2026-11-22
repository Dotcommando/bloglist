import 'reflect-metadata';

import { runDeploymentExecutor } from './infra/deployment/run-deployment-executor.js';

if (process.argv.slice(2).some((argument) => argument !== '--once')) {
  console.error('Use deployment-executor with optional --once');
  process.exitCode = 1;
} else {
  await runDeploymentExecutor(process.env, process.argv.includes('--once')).catch(() => {
    console.error('Deployment executor failed; verify private settings, MongoDB migrations and provider access.');
    process.exitCode = 1;
  });
}
