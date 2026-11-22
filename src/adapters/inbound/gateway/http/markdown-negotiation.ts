import Negotiator from 'negotiator';

export function prefersMarkdown(accept: string | undefined): boolean {
  const negotiator = new Negotiator({ headers: { accept } });

  return negotiator.mediaType(['text/html', 'text/markdown']) === 'text/markdown';
}
