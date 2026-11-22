import { formatFileSize, formatKibibytes } from '../../admin/src/features/files/file-size.js';

describe('file sizes in binary units', () => {
  it.each([
    [512, '0.5 KiB', '0,5 КиБ'],
    [10240, '10 KiB', '10 КиБ'],
    [12595, '12.3 KiB', '12,3 КиБ'],
    [1048576, '1024 KiB', '1024 КиБ'],
  ])('keeps favicon sizes in KiB with at most one fractional digit: %s', (bytes, english, russian) => {
    expect(formatKibibytes(bytes, 'en')).toBe(english);
    expect(formatKibibytes(bytes, 'ru')).toBe(russian);
  });

  it.each([
    [512, '0.5 KiB', '0,5 КиБ'],
    [1024, '1 KiB', '1 КиБ'],
    [1.25 * 1024, '1.2 KiB', '1,2 КиБ'],
    [10239, '10 KiB', '10 КиБ'],
    [10240, '10 KiB', '10 КиБ'],
    [10.5 * 1024, '11 KiB', '11 КиБ'],
    [1048575, '1024 KiB', '1024 КиБ'],
    [1048576, '1 MiB', '1 МиБ'],
    [1.5 * 1048576, '1.5 MiB', '1,5 МиБ'],
    [10.01 * 1048576, '10 MiB', '10 МиБ'],
    [10.05 * 1048576, '10 MiB', '10 МиБ'],
    [10.06 * 1048576, '10.1 MiB', '10,1 МиБ'],
    [10.15 * 1048576, '10.2 MiB', '10,2 МиБ'],
  ])('formats %s bytes with the requested precision and no trailing zeros', (bytes, english, russian) => {
    expect(formatFileSize(bytes, 'en')).toBe(english);
    expect(formatFileSize(bytes, 'ru')).toBe(russian);
  });
});
