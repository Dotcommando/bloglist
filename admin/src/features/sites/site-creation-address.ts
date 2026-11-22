export function developmentOrigin(address: string): string {
  const raw = address.trim();
  const parsed = new URL(raw.includes('://') ? raw : 'http://' + raw);
  const port = /:([0-9]+)\/?$/.exec(raw);

  if (
    !port
    || Number(port[1]) < 1
    || Number(port[1]) > 65535
    || !['http:', 'https:'].includes(parsed.protocol)
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) {
    throw new Error('Invalid development address');
  }

  return parsed.origin;
}
