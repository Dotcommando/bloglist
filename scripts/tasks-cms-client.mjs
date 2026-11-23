const cookieName = 'zarya_admin_session';

export class CmsHttpError extends Error {
  constructor(status, code, pathname) {
    super('CMS ' + status + ' ' + code + ' on ' + pathname);
    this.status = status;
    this.code = code;
  }
}

export class CmsSession {
  #cookies = [];
  #credentials;

  constructor(origin, credentials, timeoutMs = 15_000) {
    const url = new URL(origin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

    if (url.origin !== origin || url.protocol !== 'http:' || !loopback) {
      throw new Error('A loopback CMS HTTP origin is required');
    }
    this.origin = origin;
    this.timeoutMs = timeoutMs;
    this.#credentials = credentials;
  }

  async login() {
    const response = await this.#send('/api/admin/auth/login', this.#credentials);

    this.#cookies = response.headers.getSetCookie().map(header => header.split(';', 1)[0]);

    if (!this.#cookies.some(cookie => cookie.startsWith(cookieName + '='))) {
      throw new Error('CMS did not issue a session');
    }
    await response.body?.cancel();
  }

  browserCookies() {
    return this.#cookies.map(cookie => {
      const index = cookie.indexOf('=');
      const name = cookie.slice(0, index);

      return {
        name,
        value: cookie.slice(index + 1),
        domain: new URL(this.origin).hostname,
        path: name === cookieName ? '/api/admin' : '/admin',
        httpOnly: true,
        sameSite: 'Strict',
      };
    });
  }

  async request(pathname, body, key) {
    if (!this.#cookies.length) {
      await this.login();
    }

    let response;

    try {
      response = await this.#send(pathname, body, key);
    } catch (error) {
      if (error instanceof CmsHttpError && error.status === 401) {
        await this.login();
      } else if (!(body === undefined || key) || !(error instanceof TypeError || error.name === 'TimeoutError')) {
        throw error;
      }
      response = await this.#send(pathname, body, key);
    }

    return response.json();
  }

  async #send(pathname, body, key) {
    const target = new URL(pathname, this.origin);

    if (target.origin !== this.origin || !target.pathname.startsWith('/api/admin/')) {
      throw new Error('Unexpected CMS path');
    }

    const response = await fetch(target, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: this.origin,
        'X-Zarya-Admin': '1',
        ...(this.#cookies.length ? { Cookie: this.#cookies.join('; ') } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      let code = 'RequestFailed';

      try {
        const result = await response.json();

        if (typeof result?.error === 'string' && /^[A-Za-z0-9]+$/.test(result.error)) {
          code = result.error;
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
      }
      throw new CmsHttpError(response.status, code, target.pathname);
    }

    return response;
  }
}
