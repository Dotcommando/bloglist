import { createServer } from 'node:http';

import { AdminAuthController } from '../../src/adapters/inbound/rest/admin-auth/admin-auth.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';

it('rejects a flood of concurrent login requests before admitting extra password work', async () => {
  let entered!: () => void;
  const twoEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const release: (() => void)[] = [];
  const execute = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      release.push(resolve);

      if (release.length === 2) {
        entered();
      }
    });
    throw new BusinessError(BusinessErrorCode.InvalidCredentials, 'Invalid credentials');
  });
  const unused = {
    execute: async (): Promise<never> => {
      throw new Error('Unexpected operation');
    },
  };
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing listener');
  }

  const origin = 'http://127.0.0.1:' + address.port;
  const controller = new AdminAuthController({ origin }, { execute }, unused, unused, unused, unused);

  server.on('request', (request, response) => {
    void controller.handle(request, response);
  });
  const send = (index: number): Promise<Response> => fetch(origin + '/api/admin/auth/login', {
    method: 'POST',
    headers: { origin, 'x-zarya-admin': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'attack' + index + '@example.test', password: 'wrong' }),
  });
  const first = send(0);
  const second = send(1);

  try {
    await twoEntered;
    const third = send(2);
    const outcome = await Promise.race([
      third.then((response) => response.status),
      new Promise<string>((resolve) => setTimeout(() => resolve('password work was admitted'), 200)),
    ]);

    expect(outcome).toBe(429);
    expect(execute).toHaveBeenCalledTimes(2);
  } finally {
    release.forEach((resolve) => resolve());
    await Promise.all([first, second]);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
