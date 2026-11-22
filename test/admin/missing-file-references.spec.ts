const modulePath = '../../admin/src/features/files/missing-file-references.ts';

const module: unknown = await import(modulePath);

if (
  !module
  || typeof module !== 'object'
  || !('missingFileReferences' in module)
  || typeof module.missingFileReferences !== 'function'
) {
  throw new Error('Missing file reference inspector');
}

const missingFileReferences = module.missingFileReferences;

it('preserves missing literal paths and detects references in HTML, CSS, srcset and TV text', () => {
  const source = '<img src="/assets/images/removed.png" srcset="/assets/images/removed--w320.webp 320w">'
    + ' a { background: url("/assets/files/gone.pdf"); }'
    + '<img src="https://foreign.test/assets/images/external.png">';

  expect(missingFileReferences(source, [])).toEqual([
    '/assets/images/removed.png', '/assets/images/removed--w320.webp', '/assets/files/gone.pdf',
  ]);
  expect(source).toContain('/assets/images/removed.png');
});

it('recognizes encoded filenames, ignores query strings, and does not report catalogued outputs', () => {
  expect(missingFileReferences('<img src="/assets/images/logo%20(2).png?v=1">', [{
    outputs: [{ url: '/assets/images/logo%20(2).png' }],
  }])).toEqual([]);
  expect(missingFileReferences('"/assets/images/missing.png" "/assets/images/missing.png"', [])).toEqual([
    '/assets/images/missing.png',
  ]);
});
