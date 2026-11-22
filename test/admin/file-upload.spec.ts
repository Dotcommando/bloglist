const modulePath = '../../admin/src/features/files/files-api.ts';

const module: unknown = await import(modulePath);

if (!module || typeof module !== 'object' || !('uploadImage' in module) || typeof module.uploadImage !== 'function') {
  throw new Error('Missing upload API');
}

const uploadImage = module.uploadImage;

it('sends the original File as a binary body without FileReader or base64 expansion', async () => {
  const upload = new File(['name,value\nsynthetic,1\n'], 'report (2).csv', { type: 'text/csv' });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    version: 'v2', files: [], folders: [], pending: false,
  }), { headers: { 'Content-Type': 'application/json' } }));

  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('FileReader', class {
    constructor() {
      throw new Error('Whole-file browser buffering is forbidden');
    }
  });

  try {
    await uploadImage('site', 'v1', null, upload, 'Original');
    const init = fetcher.mock.calls[0]?.[1];

    if (!init) {
      throw new Error('Missing upload request');
    }
    expect(init.body).toBe(upload);
    const headers = new Headers(init.headers);

    expect(headers.get('Content-Type')).toBe('application/octet-stream');
    const metadata = headers.get('X-Zarya-File-Metadata');

    if (!metadata) {
      throw new Error('Missing upload metadata');
    }
    expect(JSON.parse(decodeURIComponent(metadata))).toEqual({
      expectedVersion: 'v1', folderId: null, mode: 'Original', filename: upload.name,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
