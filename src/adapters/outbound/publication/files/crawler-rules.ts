import robotsParser from 'robots-parser';

import type { IRobotsBlock } from '../../../../domain/publication/crawler-diagnostics.js';

export function crawlerRules(content: string | null):
(path: string) => { readonly blockedBy: readonly IRobotsBlock[] } {
  const source = content ?? '';
  const lines = source.split(/\r\n|\r|\n/);
  const agents = [...new Set(['*', ...[...source.matchAll(/^\s*user-agent\s*:\s*([^\s#]+)/gim)]
    .map((match) => match[1]!)])];
  const parser = robotsParser('https://crawler.invalid/robots.txt', source);

  return (path) => {
    const url = new URL(path, 'https://crawler.invalid').href;
    const blockedBy = agents.flatMap((agent): IRobotsBlock[] => {
      if (!parser.isDisallowed(url, agent)) {
        return [];
      }

      const line = parser.getMatchingLineNumber(url, agent);

      return [{ agent, line, rule: (lines[line - 1] ?? '').trim() }];
    });

    return { blockedBy };
  };
}
