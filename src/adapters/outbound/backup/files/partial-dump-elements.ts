import { randomUUID } from 'node:crypto';

import { DumpItemAction, type IDumpItem, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import {
  ElementBackupState, type IRenderingElementState, maximumElementOrdinal,
  RenderingElement,
} from '../../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { BasicRenderingSourceAdapter } from '../../rendering/files/basic-rendering-source.adapter.js';
import { FileElementBackupAdapter } from '../../rendering/files/element-backup.adapter.js';
import { readElement } from '../../rendering/files/element-codec.js';
import { FileElementFallbackAdapter } from '../../rendering/files/element-fallback.adapter.js';
import { FileRenderingSourceAdapter } from '../../rendering/files/rendering-source.adapter.js';
import { tokenize } from '../../rendering/modx/tags.js';
import { databaseRecords } from '../mongoose/dump-database.adapter.js';

export function dumpElementKind(type: SiteDumpType): TemplateSourceKind | null {
  return type === SiteDumpType.Snippets ? TemplateSourceKind.Snippet
    : type === SiteDumpType.Chunks ? TemplateSourceKind.Chunk
      : type === SiteDumpType.Templates ? TemplateSourceKind.Template : null;
}

export async function dumpElementCatalog(siteId: string, sourcesRoot: string,
  documents: string): Promise<readonly IRenderingElementState[]> {
  const stored: IRenderingElementState[] = [];

  for await (const row of databaseRecords(documents)) {
    if (row.collection === 'rendering_elements') {
      const { _id, ...fields } = row.document;

      stored.push(readElement({ ...fields, elementId: _id }));
    }
  }
  const files = new FileRenderingSourceAdapter(sourcesRoot, new BasicRenderingSourceAdapter());
  const fallback = await new FileElementFallbackAdapter(files).list(siteId, stored);

  return [...stored, ...fallback];
}

export function reviewDumpElements(current: readonly IRenderingElementState[],
  imported: readonly IRenderingElementState[]): readonly IDumpItem[] {
  return imported.map((element) => {
    const targets = current.filter((item) => item.kind === element.kind
      && item.name.normalize('NFC') === element.name.normalize('NFC'));

    return {
      id: element.elementId,
      name: element.name,
      key: element.key,
      action: targets.length > 1 ? DumpItemAction.ChooseTarget
        : targets.length ? DumpItemAction.Replace : DumpItemAction.Create,
      targetId: targets.length === 1 ? targets[0]!.elementId : null,
      targets: targets.map((item) => ({ id: item.elementId, name: item.name, key: item.key })),
    };
  });
}

function rewrittenChunks(html: string, keys: ReadonlyMap<string, string>): string {
  if (!keys.size) {
    return html;
  }

  return tokenize(html).map((node) => {
    if ('text' in node) {
      return node.text;
    }

    let name = node.name;
    const parameters = { ...node.parameters };
    let changed = false;

    if (name.startsWith('$') && keys.has(name.slice(1))) {
      name = '$' + keys.get(name.slice(1));
      changed = true;
    }

    for (const key of node.name === 'Each' ? ['chunk'] : node.name === 'If' ? ['then', 'else'] : []) {
      const value = parameters[key];

      if (value && keys.has(value)) {
        parameters[key] = keys.get(value)!;
        changed = true;
      }
    }

    if (!changed) {
      return '[[' + node.tag + ']]';
    }

    const escape = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('`', '\\`');
    const args = Object.entries(parameters).map(([key, value]) => '&' + key + '=`' + escape(value) + '`').join(' ');

    return '[[' + (node.request ? '!' : '') + name + (args ? '? ' + args : '') + ']]';
  }).join('');
}

export async function mergeDumpElements(siteId: string, current: readonly IRenderingElementState[],
  imported: readonly IRenderingElementState[], choices: readonly { id: string; targetId: string | null }[],
  stagedSources: string, sequenceFloor: ReadonlyMap<TemplateSourceKind, bigint> = new Map()):
Promise<readonly IRenderingElementState[]> {
  const result: IRenderingElementState[] = [];
  const claimed = new Set<string>();
  const keys = new Map<string, string>();

  for (const choice of choices) {
    const source = imported.find((item) => item.elementId === choice.id);

    if (!source) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Unknown selected source');
    }

    const matches = current.filter((item) => item.kind === source.kind
      && item.name.normalize('NFC') === source.name.normalize('NFC'));
    const target = choice.targetId === null ? null : matches.find((item) => item.elementId === choice.targetId);

    if (choice.targetId !== null && !target || choice.targetId === null && matches.length) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Select the current named target');
    }

    let key = target?.key;

    if (!key) {
      const floor = [...current, ...result].filter((item) => item.kind === source.kind)
        .reduce((maximum, item) => /^[1-9][0-9]{0,18}$/.test(item.key) && BigInt(item.key) > maximum
          ? BigInt(item.key) : maximum, sequenceFloor.get(source.kind) ?? 0n);

      if (floor >= maximumElementOrdinal) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Key sequence exhausted');
      }
      key = (floor + 1n).toString();
    }

    const elementId = target?.elementId ?? randomUUID();

    if (claimed.has(source.kind + ':' + source.name.normalize('NFC')) || claimed.has(elementId)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Several sources replace the same target');
    }
    claimed.add(source.kind + ':' + source.name.normalize('NFC'));
    claimed.add(elementId);
    const now = new Date();
    const next = new RenderingElement({
      ...source,
      siteId,
      elementId,
      key,
      version: randomUUID(),
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
      backupState: ElementBackupState.Ready,
    }).toState();

    result.push(next);

    if (source.kind === TemplateSourceKind.Chunk && source.key !== key) {
      keys.set(source.key, key);
    }
  }
  const backup = new FileElementBackupAdapter(stagedSources, new FileRenderingSourceAdapter(stagedSources));
  const completed = result.map((element) => ({ ...element, html: rewrittenChunks(element.html, keys) }));

  for (const element of completed) {
    await backup.write(element);
  }

  return completed;
}
