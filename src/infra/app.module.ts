import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { AppController } from '../adapters/inbound/rest/app.controller.js';
import { AppService } from '../adapters/inbound/rest/app.service.js';
import type { ISitesModuleOptions } from './sites/sites.module.js';
import { SitesModule } from './sites/sites.module.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  static registerSites(options: ISitesModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [SitesModule.register(options)],
      exports: [SitesModule],
    };
  }
}
