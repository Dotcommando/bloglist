import {
  AsyncLocalStorage,
} from 'node:async_hooks';
import type {
  IncomingMessage, ServerResponse,
} from 'node:http';

import {
  adminAddressOrigin, type IInstallationSettings,
} from '../../../../domain/installation/installation-settings.js';
import {
  adminAddressProof,
} from '../../../shared/admin-address-proof.js';
import {
  AdminDocumentController,
} from '../../documents/http/admin/admin-document.controller.js';

/** Captures one committed boundary for the entire asynchronous HTTP dispatch. */
export class InstallationAdminContext {
  private readonly scope = new AsyncLocalStorage<IInstallationSettings>();

  constructor(private readonly read: () => Promise<IInstallationSettings>, private readonly key: () => Promise<string>,
    private readonly initialOrigin: string, private readonly adminRoot?: string) {}

  readonly origin = (): string => this.scope.getStore()?.adminOrigin ?? this.initialOrigin;

  readonly cookieVersion = (): string => {
    const settings = this.scope.getStore();

    if (!settings) {
      throw new Error('No captured installation settings');
    }

    return settings.version;
  };

  readonly previousOrigin = (): string | null => this.scope.getStore()?.previousOrigin ?? null;

  async run(request: IncomingMessage, response: ServerResponse, dispatch: () => Promise<void>): Promise<void> {
    const pathname = request.url?.split('?')[0] ?? '';

    if (!/^\/(?:api\/admin|admin)(?:\/|$)/.test(pathname)) {
      await dispatch();

      return;
    }

    try {
      if (await this.probe(request, response)) {
        return;
      }

      const settings = await this.read();

      await this.scope.run(settings, dispatch);
    } catch {
      if (!response.headersSent) {
        response.writeHead(503, { 'Cache-Control': 'no-store' });
      }
      response.end();
    }
  }

  private async probe(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    if (!this.adminRoot || request.method !== 'HEAD' || !request.url?.startsWith('/admin/?')) {
      return false;
    }

    const url = new URL(request.url, 'https://localhost');
    const nonce = url.searchParams.get('zarya-admin-probe');

    if (!nonce || !/^[a-f0-9]{64}$/.test(nonce) || url.searchParams.size !== 1) {
      return false;
    }

    let origin: string;

    try {
      origin = adminAddressOrigin('https://' + request.headers.host + '/admin/');
    } catch {
      return false;
    }
    response.setHeader('X-Zarya-Admin-Proof', adminAddressProof(await this.key(), new URL(origin).host, nonce));
    await new AdminDocumentController(this.adminRoot, origin).handle(request, response);

    return true;
  }
}
