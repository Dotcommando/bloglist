import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  createAdminUserFromConsole, readAdminCreationSiteId,
} from './adapters/inbound/cli/admin-users/create-admin-user.cli.js';
import { BusinessError } from './domain/shared/business-error.js';
import { CREATE_ADMIN_USER_FROM_CONSOLE } from './infra/admin-users/admin-users.tokens.js';
import { AppModule } from './infra/app.module.js';
import { readLocalSettings } from './infra/local-application.settings.js';
import type { ICreateAdminUserFromConsole } from './ports/inbound/admin-users/create-admin-user-from-console.port.js';

let application: INestApplicationContext | undefined;

try {
  if (process.stdin.isTTY) {
    throw new Error('Use the interactive creation script');
  }

  const siteId = readAdminCreationSiteId(process.argv.slice(2));
  const settings = readLocalSettings(process.env);

  application = await NestFactory.createApplicationContext(AppModule.forAdminUserCreation(settings),
    { logger: false, abortOnError: false });
  const creation = application.get<ICreateAdminUserFromConsole>(CREATE_ADMIN_USER_FROM_CONSOLE);
  const id = await createAdminUserFromConsole(creation,
    settings.operator.operatorId, process.stdin, siteId);

  console.info('Created administrator: ' + id);
} catch (error) {
  console.error(error instanceof BusinessError ? 'Administrator creation failed: ' + error.message
    : 'Administrator creation failed. Check input, local settings and applied migrations.');
  process.exitCode = 1;
} finally {
  try {
    await application?.close();
  } catch {
    console.error('Administrator creation context did not close cleanly.');
    process.exitCode = 1;
  }
}
