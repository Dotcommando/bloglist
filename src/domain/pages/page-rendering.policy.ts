import { parseRequestCachePolicy } from '../publication/request-cache.policy.js';
import { requireCondition, requireText } from '../shared/validation.js';
import type { IPageRendering } from './page-rendering.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from './page-rendering.js';

export function validatePageRendering(rendering: IPageRendering): void {
  if (rendering.requestCache !== undefined) {
    parseRequestCachePolicy(rendering.requestCache);
    requireCondition(rendering.delivery === HtmlDelivery.Request, 'Only Request pages may enable a document cache');
  }
  requireText(rendering.templateId, 'templateId');
  requireCondition(Object.values(HtmlDelivery).includes(rendering.delivery), 'Invalid HTML delivery');
  requireCondition(Object.values(BrowserInteraction).includes(rendering.interaction), 'Invalid browser interaction');
  const bindings = new Map(rendering.loaders.map((binding) => [binding.alias, binding]));

  requireCondition(bindings.size === rendering.loaders.length, 'Duplicate loader alias');
  const complete = new Set<string>();
  const active = new Set<string>();
  const visit = (alias: string): void => {
    if (complete.has(alias)) {
      return;
    }
    requireCondition(!active.has(alias), 'Cyclic loader dependencies');
    const binding = bindings.get(alias);

    if (!binding) {
      throw new RangeError(`Unknown loader dependency: ${alias}`);
    }
    requireText(binding.loaderId, 'loaderId');
    requireCondition(/^[A-Za-z][A-Za-z0-9_]*$/.test(alias)
      && !['page', 'site', 'request'].includes(alias), 'Invalid or reserved loader alias');
    requireCondition(Object.values(LoaderPhase).includes(binding.phase), 'Invalid loader phase');
    requireCondition(rendering.delivery !== HtmlDelivery.Static || binding.phase === LoaderPhase.Build,
      'A static page cannot contain request loaders');
    active.add(alias);

    for (const dependency of binding.dependsOn) {
      requireCondition(binding.phase !== LoaderPhase.Build || bindings.get(dependency)?.phase !== LoaderPhase.Request,
        'A build loader cannot depend on request data');
      visit(dependency);
    }
    active.delete(alias);
    complete.add(alias);
  };

  for (const alias of bindings.keys()) {
    visit(alias);
  }
}
