import { httpReadyMessage } from '../../src/infra/resources/http-ready-message.js';

describe('HTTP readiness console summary', () => {
  it('prints configured site addresses alongside general and per-site administration links', () => {
    expect(httpReadyMessage({
      elapsedMs: 12345,
      address: { address: '127.0.0.1', port: 43210, family: 'IPv4' },
      administrationOrigin: 'http://localhost:43210',
      sites: [
        { siteId: 'catalog', name: 'Каталог блогеров', origin: 'http://localhost:3003', localListenerReady: true },
        { siteId: 'psychologist', name: 'Psychologist', origin: 'https://psychologist.example', localListenerReady: false },
        { siteId: 'new', name: 'New site', origin: null, localListenerReady: false },
      ],
    })).toBe([
      'Zarya HTTP server is ready.',
      'Startup time: 12.35 s.',
      'Listening socket: 127.0.0.1:43210',
      'Administration: http://localhost:43210/admin/',
      '',
      'Sites (configured addresses):',
      '- http://localhost:3003 - Каталог блогеров [local HTTP listener ready]',
      '- https://psychologist.example - Psychologist [external routing required]',
      '- (address not configured) - New site',
      '',
      'Site administration:',
      '- http://localhost:43210/admin/sites/catalog - Каталог блогеров',
      '- http://localhost:43210/admin/sites/psychologist - Psychologist',
      '- http://localhost:43210/admin/sites/new - New site',
    ].join('\n'));
  });

  it('formats IPv6 listeners and a clean installation without inventing a site or admin URL', () => {
    const output = httpReadyMessage({
      elapsedMs: 50,
      address: { address: '::', port: 3000, family: 'IPv6' },
      administrationOrigin: null,
      sites: [],
    });

    expect(output).toContain('Listening socket: [::]:3000');
    expect(output).toContain('No sites configured.');
    expect(output).not.toContain('Administration:');
  });
});

it('prints the ready message from the HTTP entrypoint using its actual listener and full process uptime', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.spyOn(process, 'once').mockReturnValue(process);
  vi.spyOn(process, 'uptime').mockReturnValue(12.345);
  vi.doMock('../../src/infra/public-http.settings.js', () => ({
    readPublicHttpSettings: () => ({ port: 0, adminAuth: { origin: 'http://localhost:43210' } }),
  }));
  vi.doMock('../../src/infra/resources/process-supervisor.settings.js', () => ({
    readProcessSupervisorSettings: async () => ({}),
  }));
  vi.doMock('../../src/infra/resources/process-supervisor.js', () => ({
    createProcessSupervisor: async () => ({
      server: { address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 43210 }) },
      startupSites: [{ siteId: 'test-site', name: 'Test site', origin: 'http://localhost:3000', localListenerReady: true }],
      close: vi.fn(),
    }),
  }));

  try {
    await import('../../src/public-http.js');
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toContain('Startup time: 12.35 s.');
    expect(info.mock.calls[0]?.[0]).toContain('Listening socket: 127.0.0.1:43210');
    expect(info.mock.calls[0]?.[0]).toContain('- http://localhost:43210/admin/sites/test-site - Test site');
    expect(errors).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.doUnmock('../../src/infra/public-http.settings.js');
    vi.doUnmock('../../src/infra/resources/process-supervisor.settings.js');
    vi.doUnmock('../../src/infra/resources/process-supervisor.js');
    vi.resetModules();
  }
});
