import {
  type Agent, type ClientRequest, type IncomingMessage, request as connect, type ServerResponse,
} from 'node:http';

/** Streams each request to a selected private worker; connections are never shared across site pools. */
export function proxyProcessRequest(request: IncomingMessage, response: ServerResponse,
  port: number, secret: string, agent: Agent): void {
  const headers: string[] = [];
  const excluded = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-zarya-process-secret', 'x-zarya-process-source',
    ...(request.headers.connection ?? '').split(',').map((name) => name.trim().toLowerCase())]);

  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (!excluded.has(request.rawHeaders[index]!.toLowerCase())) {
      headers.push(request.rawHeaders[index]!, request.rawHeaders[index + 1]!);
    }
  }
  headers.push('X-Zarya-Process-Secret', secret, 'X-Zarya-Process-Source', request.socket.remoteAddress ?? '');
  const bodylessRead = (request.method === 'GET' || request.method === 'HEAD')
    && request.headers['transfer-encoding'] === undefined
    && (request.headers['content-length'] === undefined || request.headers['content-length'] === '0');
  let upstream: ClientRequest | undefined;
  const unavailable = (): void => {
    if (response.destroyed) {
      return;
    }
    if (response.headersSent) {
      response.destroy();

      return;
    }
    response.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '5' }).end();
  };
  const forward = (retry: boolean): void => {
    const outgoing = connect({
      hostname: '127.0.0.1',
      port,
      method: request.method,
      path: request.url,
      headers,
      agent: retry ? false : agent,
    }, (incoming) => {
      if (response.destroyed) {
        incoming.destroy();

        return;
      }

      const excludedResponse = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailer', 'transfer-encoding', 'upgrade',
        ...(incoming.headers.connection ?? '').split(',').map((name) => name.trim().toLowerCase())]);
      const responseHeaders = Object.fromEntries(Object.entries(incoming.headers)
        .filter(([name]) => !excludedResponse.has(name.toLowerCase())));

      response.writeHead(incoming.statusCode ?? 502, responseHeaders);
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
      response.once('close', () => incoming.destroy());
    });

    upstream = outgoing;
    outgoing.on('error', (error: Error) => {
      if (upstream !== outgoing) {
        return;
      }
      if (
        !retry
        && bodylessRead
        && outgoing.reusedSocket
        && 'code' in error
        && error.code === 'ECONNRESET'
        && !request.aborted
        && !response.destroyed
        && !response.headersSent
      ) {
        // A peer may retire an idle keep-alive socket just as the agent selects it.
        request.unpipe(outgoing);

        try {
          forward(true);
        } catch {
          unavailable();
        }

        return;
      }
      unavailable();
    });
    outgoing.setTimeout(31 * 60 * 1000, () => outgoing.destroy(new Error('Worker response deadline exceeded')));

    if (retry) {
      outgoing.end();
    } else {
      request.pipe(outgoing);
    }
  };

  request.once('aborted', () => upstream?.destroy());
  request.once('error', () => upstream?.destroy());
  response.once('close', () => upstream?.destroy());
  response.once('error', () => upstream?.destroy());
  forward(false);
}

export interface IAdmittedProcessRequest {
  readonly worker: { readonly port: number };
  release(): void;
}

export function proxyAdmittedProcessRequest(request: IncomingMessage, response: ServerResponse,
  acquire: () => IAdmittedProcessRequest, secret: string, agent: Agent): void {
  if (request.aborted || response.destroyed || response.writableEnded) {
    return;
  }

  const admitted = acquire();
  const release = (): void => {
    response.off('finish', release);
    response.off('close', release);
    admitted.release();
  };

  response.once('finish', release);
  response.once('close', release);

  try {
    proxyProcessRequest(request, response, admitted.worker.port, secret, agent);
  } catch (error) {
    release();
    throw error;
  }
}
