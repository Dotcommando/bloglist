import type { IFileOutput } from './files.types';

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Inspect literal library paths; never fetch or execute the authored source. */
export function missingFileReferences(source: string,
  files: readonly { readonly outputs: readonly Pick<IFileOutput, 'url'>[] }[]): string[] {
  const known = new Set(files.flatMap((file) => file.outputs.map((output) => decoded(output.url))));
  const result = new Set<string>();
  const tokens = source.matchAll(/https?:\/\/[^\s"'<>\x60]+|\/(?:assets|media)\/(?:images|files)\/[^\s"'<>\x60]+/gu);

  for (const [token] of tokens) {
    if (!token.startsWith('/')) {
      continue;
    }

    const path = token.replace(/[),;}\]]+$/gu, '').split(/[?#]/u)[0]!;

    if (!known.has(decoded(path))) {
      result.add(path);
    }
  }

  return [...result];
}
