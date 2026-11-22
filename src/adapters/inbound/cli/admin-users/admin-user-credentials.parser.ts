export interface IAdminUserCredentials {
  readonly email: string;
  readonly password: string;
}

const MAX_CREDENTIAL_INPUT_BYTES = 8192;

export async function readAdminUserCredentials(input: AsyncIterable<Uint8Array>): Promise<IAdminUserCredentials> {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of input) {
    size += chunk.byteLength;

    if (size > MAX_CREDENTIAL_INPUT_BYTES) {
      throw new RangeError('Credential input exceeds its byte limit');
    }
    chunks.push(chunk);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
  const lines = text.split('\n');

  if (lines.length !== 3 || lines[2] !== '' || !lines[0] || !lines[1]) {
    throw new RangeError('Expected exactly two non-empty credential lines');
  }

  return { email: lines[0], password: lines[1] };
}
