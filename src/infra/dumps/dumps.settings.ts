import path from 'node:path';

export function validateDumpsRoot(root: string | undefined, otherRoots: readonly (string | undefined)[]): string {
  if (root !== undefined && !root.trim()) {
    throw new RangeError('Dump root must be non-empty');
  }

  const resolved = path.resolve(root ?? 'dumps');

  for (const other of otherRoots) {
    if (other === undefined) {
      continue;
    }

    const directory = path.resolve(other);

    if (
      resolved === directory
      || resolved.startsWith(directory + path.sep)
      || directory.startsWith(resolved + path.sep)
    ) {
      throw new RangeError('Private dumps must be separate from site, media, publication and administration roots');
    }
  }

  return resolved;
}
