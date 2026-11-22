import type * as Http from 'node:http';
import { createServer } from 'node:http';

import { LocalPreviewDeliveryAdapter } from '../../src/adapters/outbound/publication/local/preview-delivery.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';

vi.mock('node:http', async (original) => {
  const http = await original<typeof Http>();

  return { ...http, createServer: vi.fn(http.createServer) };
});

it('recovers a failed preview listener start with a fresh owned listener', async () => {
  const native = await vi.importActual<typeof Http>('node:http');
  const failure = Object.assign(new Error('Loopback unavailable'), { code: 'EADDRNOTAVAIL' });

  vi.mocked(createServer).mockImplementationOnce((...args) => {
    const server = native.createServer(...args);

    vi.spyOn(server, 'listen').mockImplementation(() => {
      queueMicrotask(() => server.emit('error', failure));

      return server;
    });

    return server;
  });
  const adapter = new LocalPreviewDeliveryAdapter();
  const document = { pageId: 'page', html: '', frontendSourceIds: [] };
  const file = artifact('index.html', 'text/html', '<h1>Recovered</h1>');
  const build = { manifest: { routes: [], artifacts: [file] }, artifacts: [file] };

  try {
    await expect(adapter.present(document, build)).rejects.toBe(failure);
    const recovered = await adapter.present(document, build);
    const response = await fetch(recovered.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<h1>Recovered</h1>');
  } finally {
    await adapter.close();
  }
});
