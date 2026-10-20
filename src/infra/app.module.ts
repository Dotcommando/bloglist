import { Module } from '@nestjs/common';

import { AppController } from '../adapters/inbound/rest/app.controller.js';
import { AppService } from '../adapters/inbound/rest/app.service.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
