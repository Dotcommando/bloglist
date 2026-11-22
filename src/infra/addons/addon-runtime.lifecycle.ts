import type { OnApplicationBootstrap } from '@nestjs/common';

import type { AddonRuntimeService } from '../../app/services/addons/addon-runtime.service.js';

export class AddonRuntimeLifecycle implements OnApplicationBootstrap {
  constructor(private readonly runtime: AddonRuntimeService, private readonly coordinatorOnly = false) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.coordinatorOnly) {
      await this.runtime.validate();
    }
  }
}
