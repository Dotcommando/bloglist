import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import type { ILocalApplicationSettings } from './local-application.settings.js';

export async function createLocalApplication(settings: ILocalApplicationSettings): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(AppModule.forLocalOperator(settings),
    { logger: false, abortOnError: false });
}
