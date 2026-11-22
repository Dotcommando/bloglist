import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { PublicMediaController } from '../../src/adapters/inbound/documents/http/media/public-media.controller.js';
import { AdminAddonRuntimeController } from '../../src/adapters/inbound/rest/addons/admin-addon-runtime.controller.js';
import { AdminFilesController } from '../../src/adapters/inbound/rest/media/admin-files.controller.js';
import { writeFileResponse } from '../../src/adapters/inbound/shared/file-response.js';
import { libraryOperations } from '../support/media.js';

it('resumes a normal backpressured transfer after drain and preserves all bytes', async () => {
  const socket = new Socket();
  const request = new IncomingMessage(socket);
  const response = new ServerResponse(request);
  const chunks: Buffer[] = [];
  let writes = 0;

  vi.spyOn(response, 'write').mockImplementation((chunk: Uint8Array) => {
    chunks.push(Buffer.from(chunk));
    writes++;

    if (writes === 1) {
      queueMicrotask(() => response.emit('drain'));

      return false;
    }

    return true;
  });

  try {
    await writeFileResponse(response, (async function* () {
      yield Buffer.from('first');
      yield Buffer.from('second');
    })());
    expect(Buffer.concat(chunks).toString()).toBe('firstsecond');
    expect(response.listenerCount('drain')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  } finally {
    socket.destroy();
  }
});

it.each(['media', 'admin-file', 'addon', 'bound-addon'])(
  'closes the source and settles a backpressured response after disconnect: %s',
  async (kind) => {
    let released = false;
    const content = {
      byteSize: 128 * 1024,
      mimeType: 'text/csv',
      bytes: (async function* () {
        try {
          yield Buffer.alloc(64 * 1024);
          yield Buffer.alloc(64 * 1024);
        } finally {
          released = true;
        }
      })(),
    };
    const socket = new Socket();
    const request = new IncomingMessage(socket);
    const digest = 'a'.repeat(64);
    const section = kind === 'bound-addon' ? 'addon-workspaces' : 'addon-runtime';

    request.method = 'GET';
    request.url = kind === 'media' ? '/assets/files/report.csv'
      : kind === 'admin-file' ? '/api/admin/sites/site/files/file/content'
        : '/api/admin/sites/site/' + section + '/synthetic/' + digest + '/entry.js';
    request.headers = { host: 'localhost', cookie: 'zarya_admin_session=synthetic' };
    request.rawHeaders = ['Host', 'localhost'];
    const response = new ServerResponse(request);

    vi.spyOn(response, 'write').mockImplementation(() => {
      queueMicrotask(() => response.emit('close'));

      return false;
    });
    vi.spyOn(response, 'end').mockImplementation(() => response);
    const controller = kind === 'media' ? new PublicMediaController({
      execute: async () => ({ content, etag: '"v1"' }),
    }, '/assets') : kind === 'admin-file' ? new AdminFilesController({ origin: 'http://localhost' }, {
      forSession: () => ({
        ...libraryOperations({
          readContent: { execute: async () => ({ content, filename: 'report.csv' }) },
        }),
        readableUsageTargets: async () => new Set<string>(),
      }),
    }) : new AdminAddonRuntimeController({ origin: 'http://localhost' }, {
      execute: vi.fn().mockResolvedValue({
        user: {
          adminUserId: 'admin',
          authorization: {
            systemAdmin: true, systemActionIds: ['cms.addon-runtime.read-asset'], siteIds: [], siteAdminSiteIds: [],
          },
        },
      }),
    }, { execute: vi.fn() }, { execute: async () => content }, {
      list: async () => [{
        addonKey: 'synthetic',
        digest,
        label: { en: 'Test', ru: 'Test' },
        views: ['main'],
        actionIds: ['synthetic.read'],
        entry: 'entry.js',
        styles: [],
        enabled: true,
      }],
      read: async () => content,
      timeZone: async () => null,
    });

    try {
      const completed = await Promise.race([
        controller.handle(request, response).then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 200)),
      ]);

      expect(completed).toBe(true);
      expect(released).toBe(true);
      expect(response.listenerCount('drain')).toBe(0);
    } finally {
      socket.destroy();
    }
  });
