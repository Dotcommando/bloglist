import { once } from 'node:events';
import type { ServerResponse } from 'node:http';

export async function writeFileResponse(response: ServerResponse, bytes: AsyncIterable<Uint8Array>): Promise<void> {
  const cancellation = new AbortController();
  const close = (): void => cancellation.abort();

  response.once('close', close);

  if (response.destroyed) {
    cancellation.abort();
  }

  try {
    for await (const chunk of bytes) {
      cancellation.signal.throwIfAborted();

      if (!response.write(chunk)) {
        await once(response, 'drain', { signal: cancellation.signal });
      }
    }
  } finally {
    response.removeListener('close', close);
  }
}
