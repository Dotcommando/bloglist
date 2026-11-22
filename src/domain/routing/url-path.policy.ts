export function requireUrlPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)) {
    throw new RangeError('Expected a site-relative URL path');
  }
}
