import { validateLibrary, validateMediaName } from '../../src/domain/media/file-library.js';
import { libraryFileFixture } from '../support/file-library.js';

describe('file library invariants', () => {
  it('accepts ordinary copied document filenames with parentheses while rejecting unsafe names precisely', () => {
    for (const filename of ['chgowrn_food (2).csv', 'newfood (2).csv', 'report (2).xlsx']) {
      expect(() => validateMediaName(filename)).not.toThrow();
    }
    expect(() => validateMediaName('Reports (2)', true)).not.toThrow();

    for (const [filename, issue] of [['../report.csv', 'FileInvalidName'], ['CON.csv', 'FileReservedName'],
      ['x'.repeat(181) + '.csv', 'FileNameTooLong']]) {
      try {
        validateMediaName(filename!);
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toMatchObject({ issue });
      }
    }
  });
  it('rejects unsafe variant names and geometry or storage references unrelated to the image', () => {
    const file = libraryFileFixture();
    const library = { siteId: 'site-1', version: 'v1', folders: [], files: [file] };
    const output = file.outputs[0]!;

    for (const changed of [{ ...output, suffix: '../escape.webp' },
      { ...output, contentId: 'foreign' },
      { ...output, dimensions: { width: 100, height: 10, aspectRatio: 10 } }]) {
      expect(() => validateLibrary({ ...library, files: [{ ...file, outputs: [changed] }] })).toThrow();
    }
    expect(() => validateLibrary(library)).not.toThrow();
  });
});
