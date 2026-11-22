export function normalizeSiteHostname(hostname: string): string {
  const value = hostname.trim();
  const hasPort = value.startsWith('[') ? value.indexOf(']') !== value.length - 1 : value.includes(':');

  if (!value || hasPort || /[\s/?#@\\]/.test(value)) {
    throw new RangeError('Expected a hostname without protocol, path, credentials or port');
  }

  const parsed = new URL(`https://${value}`);

  if (!parsed.hostname || parsed.port || parsed.username || parsed.password) {
    throw new RangeError('Expected a hostname without protocol, path, credentials or port');
  }

  return parsed.hostname;
}

export function normalizeSiteAuthority(value: string): string {
  if (!value || /[\s,@/\\?#]/.test(value)) {
    throw new RangeError('Invalid site authority');
  }

  const parsed = new URL('http://' + value);

  normalizeSiteHostname(parsed.hostname);

  return parsed.host;
}
