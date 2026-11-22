export function documentArtifactPath(path: string, mimeType: string): string {
  if (mimeType === 'text/html') {
    return path === '/' ? 'index.html' : path.slice(1).replace(/\/$/, '') + '/index.html';
  }

  return path.endsWith('/') ? path.slice(1) + 'index.txt' : path.slice(1);
}
