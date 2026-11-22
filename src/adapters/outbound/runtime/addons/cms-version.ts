export function supportsCmsVersion(minimum: unknown, current: unknown): boolean {
  if (
    typeof minimum !== 'string'
    || typeof current !== 'string'
    || minimum.length > 128
    || current.length > 128
    || !/^\d+\.\d+\.\d+$/.test(minimum)
    || !/^\d+\.\d+\.\d+$/.test(current)
  ) {
    return false;
  }

  const required = minimum.split('.').map((part) => part.replace(/^0+(?=\d)/, ''));
  const actual = current.split('.').map((part) => part.replace(/^0+(?=\d)/, ''));

  for (let index = 0; index < 3; index++) {
    const left = actual[index]!;
    const right = required[index]!;

    if (left.length !== right.length) {
      return left.length > right.length;
    }
    if (left !== right) {
      return left > right;
    }
  }

  return true;
}
