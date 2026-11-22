import type { IAddonObject } from '@zarya/addon-contracts/addons';

import type { IHookFact } from '../hooks/hook-execution.js';
import type { IUrlState } from './url.js';
import { UrlKind } from './url-kind.enum.js';

export function routingHookFacts(previous: readonly IUrlState[], next: readonly IUrlState[]): readonly IHookFact[] {
  const facts: IHookFact[] = [];
  const details: IAddonObject[] = [];
  const summarize = (url: IUrlState | undefined): IAddonObject | null => url ? {
    urlId: url.urlId,
    path: url.path,
    kind: url.kind,
    pageId: url.pageId,
    parentUrlId: url.parentUrlId,
    targetUrlId: url.redirectTargetUrlId,
    redirectStatus: url.redirectStatus,
  } : null;
  const before = new Map(previous.map((url) => [url.urlId, url]));
  const after = new Map(next.map((url) => [url.urlId, url]));

  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(id);
    const current = after.get(id);
    const oldView = summarize(old);
    const currentView = summarize(current);

    if (JSON.stringify(oldView) === JSON.stringify(currentView)) {
      continue;
    }

    const payload = { urlId: id, previous: oldView, next: currentView };

    details.push(payload);

    if (!old) {
      facts.push({ hookKey: 'cms.url.created', payload });
    }
    if (!current) {
      facts.push({ hookKey: 'cms.url.deleted', payload });
    }
    if (old && current) {
      if (old.path !== current.path) {
        facts.push({ hookKey: 'cms.url.path.changed', payload });
      }
      if (old.parentUrlId !== current.parentUrlId) {
        facts.push({ hookKey: 'cms.url.parent.changed', payload });
      }
      if (old.pageId !== current.pageId) {
        facts.push({ hookKey: 'cms.url.page-binding.changed', payload });
      }
    }
    if (current?.kind === UrlKind.REDIRECT && old?.kind !== UrlKind.REDIRECT) {
      facts.push({ hookKey: 'cms.redirect.created', payload });
    } else if (old?.kind === UrlKind.REDIRECT && current?.kind !== UrlKind.REDIRECT) {
      facts.push({ hookKey: 'cms.redirect.deleted', payload });
    } else if (old?.kind === UrlKind.REDIRECT && current?.kind === UrlKind.REDIRECT) {
      if (old.redirectTargetUrlId !== current.redirectTargetUrlId) {
        facts.push({ hookKey: 'cms.redirect.target.changed', payload });
      }
      if (old.redirectStatus !== current.redirectStatus) {
        facts.push({ hookKey: 'cms.redirect.status.changed', payload });
      }
    }
  }

  if (details.length) {
    facts.push({ hookKey: 'cms.routing.changed', payload: { changedCount: details.length }, details });
  }

  return facts;
}
