import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { parseElementParameters } from '../../../../domain/rendering/parameter-contract.policy.js';
import {
  ElementBackupState, type IRenderingElementState, RenderingElement,
} from '../../../../domain/rendering/rendering-element.js';
import { parseSnippetSource } from '../../../../domain/rendering/snippet-source.policy.js';

export function readElement(value: unknown): IRenderingElementState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError('Invalid element data');
  }

  const item = Object.fromEntries(Object.entries(value));
  const text = (key: string): string => {
    const result = item[key];

    if (typeof result !== 'string') {
      throw new RangeError('Expected element field: ' + key);
    }

    return result;
  };
  const kind = Object.values(TemplateSourceKind).find((kind) => kind === item.kind);
  const backupState = Object.values(ElementBackupState).find((state) => state === item.backupState);

  if (!kind || !backupState || item.browserTypeScript !== null && typeof item.browserTypeScript !== 'string') {
    throw new RangeError('Invalid element kind or content');
  }

  return new RenderingElement({
    elementId: text('elementId'),
    siteId: text('siteId'),
    key: text('key'),
    name: item.name === undefined ? text('key') : text('name'),
    kind,
    version: text('version'),
    html: text('html'),
    css: text('css'),
    browserTypeScript: item.browserTypeScript,
    parameters: parseElementParameters(item.parameters),
    ...(item.snippet === undefined ? {} : { snippet: parseSnippetSource(item.snippet) }),
    backupState,
    createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(text('createdAt')),
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(text('updatedAt')),
  }).toState();
}
