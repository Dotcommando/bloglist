import { vi } from 'vitest';

describe('console startup diagnostics', () => {
  const originalExitCode = process.exitCode;
  const originalArguments = process.argv;

  afterEach(() => {
    process.exitCode = originalExitCode;
    process.argv = originalArguments;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  for (const entry of ['public-http', 'migrate']) {
    for (const missingMigration of [true, false]) {
      it(`${entry} ${missingMigration ? 'identifies the missing migration' : 'withholds unexpected private error details'}`, async () => {
        const error = new Error(missingMigration
          ? 'Missing or modified migration: 0013-rendering-elements'
          : 'Connection failed: mongodb://operator:secret@localhost/private');
        const report = vi.spyOn(console, 'error').mockImplementation(() => {});

        process.argv = [process.execPath, entry];
        vi.doMock('../../src/infra/public-http.settings.js', () => ({ readPublicHttpSettings: () => ({}) }));
        vi.doMock('../../src/infra/resources/process-supervisor.settings.js', () => ({
          readProcessSupervisorSettings: async () => ({}),
        }));
        vi.doMock('../../src/infra/resources/process-supervisor.js', () => ({
          createProcessSupervisor: vi.fn().mockRejectedValue(error),
        }));
        vi.doMock('../../src/infra/local-application.settings.js', () => ({ readLocalSettings: () => ({}) }));
        vi.doMock('../../src/infra/persistence/run-migrations.js', () => ({
          runMigrations: vi.fn().mockRejectedValue(error),
        }));

        if (entry === 'public-http') {
          await import('../../src/public-http.js');
        } else {
          await import('../../src/migrate.js');
        }

        const output = report.mock.calls.flat().join(' ');

        expect(process.exitCode).toBe(1);

        if (missingMigration) {
          expect(output).toContain('0013-rendering-elements');
          expect(output).toContain('npm run migrate');
        } else {
          expect(output).toContain('failed');
          expect(output).not.toContain('secret');
          expect(output).not.toContain('mongodb://');
        }
      });
    }
  }
});

it('identifies the unavailable local site port without exposing its private cause', async () => {
  const { LocalSiteListenerError } = await import(
    '../../src/adapters/inbound/gateway/http/local-site-listener.error.js'
  );
  const { publicHttpStartupDiagnostic } = await import('../../src/infra/resources/public-http-startup-diagnostic.js');
  const error = new LocalSiteListenerError('http://localhost:3003', new Error('mongodb://operator:secret@private'));
  const output = publicHttpStartupDiagnostic(error);

  expect(output).toContain('http://localhost:3003');
  expect(output).toContain('Startup was cancelled');
  expect(output).not.toContain('secret');
  expect(output).not.toContain('mongodb://');
});

it.each([
  ['EADDRINUSE', undefined, 'HTTP port'],
  ['EBUSY', 'C:/private/supervisor.pid', 'coordination file'],
  ['EACCES', 'C:/private/supervisor.pid', 'coordination file'],
  ['EPERM', 'C:/private/supervisor.pid', 'coordination file'],
])('explains public HTTP startup conflicts for %s without private error details', async (code, path, expected) => {
  const originalExitCode = process.exitCode;
  const error = Object.assign(new Error('mongodb://operator:secret@localhost/private'), { code, path });
  const report = vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.resetModules();
  vi.doMock('../../src/infra/public-http.settings.js', () => ({ readPublicHttpSettings: () => ({}) }));
  vi.doMock('../../src/infra/resources/process-supervisor.settings.js', () => ({
    readProcessSupervisorSettings: async () => ({}),
  }));
  vi.doMock('../../src/infra/resources/process-supervisor.js', () => ({
    createProcessSupervisor: vi.fn().mockRejectedValue(error),
  }));

  try {
    await import('../../src/public-http.js');
    const output = report.mock.calls.flat().join(' ');

    expect(output).toContain(expected);
    expect(output).toContain('Docker');
    expect(output).not.toContain('secret');
    expect(output).not.toContain('C:/private');
    expect(process.exitCode).toBe(1);
  } finally {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.resetModules();
  }
});
