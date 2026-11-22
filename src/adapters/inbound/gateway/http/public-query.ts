export class PublicQueryLimitError extends Error {
  readonly statusCode = 414;

  constructor() {
    super('Public query exceeds the supported resource limits');
  }
}

export function parsePublicQuery(raw: string): Record<string, string | string[]> {
  const encoding = new TextEncoder();

  if (raw.length > 12288 || encoding.encode(raw).byteLength > 12288) {
    throw new PublicQueryLimitError();
  }
  decodeURIComponent(raw);
  const parameters = new URLSearchParams(raw);

  if (parameters.size > 128) {
    throw new PublicQueryLimitError();
  }

  const values = new Map<string, string | string[]>();

  for (const [name, value] of parameters) {
    if (encoding.encode(name).byteLength > 256) {
      throw new PublicQueryLimitError();
    }

    const previous = values.get(name);

    if (previous === undefined) {
      values.set(name, value);
    } else if (typeof previous === 'string') {
      values.set(name, [previous, value]);
    } else {
      previous.push(value);
    }
  }

  return Object.fromEntries(values);
}
