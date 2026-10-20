import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { AppController } from '../adapters/inbound/rest/app.controller.js';
import { AppService } from '../adapters/inbound/rest/app.service.js';
import type { IRoutingModuleOptions } from './routing/routing.module.js';
import { RoutingModule } from './routing/routing.module.js';
import type { ISitesModuleOptions } from './sites/sites.module.js';
import { SitesModule } from './sites/sites.module.js';

export interface IAppModuleOptions {
  sites?: ISitesModuleOptions;
  routing?: IRoutingModuleOptions;
}

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  static registerSites(options: ISitesModuleOptions): DynamicModule {
    return this.register({ sites: options });
  }

  static registerRouting(options: IRoutingModuleOptions): DynamicModule {
    return this.register({ routing: options });
  }

  static register(options: IAppModuleOptions): DynamicModule {
    const imports: DynamicModule[] = [];

    if (options.sites) {
      imports.push(SitesModule.register(options.sites));
    }
    if (options.routing) {
      imports.push(RoutingModule.register(options.routing));
    }

    return {
      module: AppModule,
      imports,
      exports: imports.map((entry) => entry.module),
    };
  }
}
