import { appendFile, open, readdir, readFile, rename, rm } from 'node:fs/promises';

import ts from 'typescript';

import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { ElementBackupState, type IRenderingElementState } from '../../../../domain/rendering/rendering-element.js';
import { FileElementBackupAdapter } from '../../rendering/files/element-backup.adapter.js';
import { readElement } from '../../rendering/files/element-codec.js';
import { FileElementFallbackAdapter } from '../../rendering/files/element-fallback.adapter.js';
import { FileRenderingSourceAdapter } from '../../rendering/files/rendering-source.adapter.js';
import { databaseRecords, encodeDocument } from '../mongoose/dump-database.adapter.js';
import { checked } from './dump-files.js';

/** Imported trusted configuration may contain literal data, never executable server expressions. */
export async function validateDumpConfigs(root: string): Promise<void> {
  const literal = (node: ts.Node): boolean => ts.isStringLiteral(node) || ts.isNumericLiteral(node)
    || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)
    || ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken
      && ts.isNumericLiteral(node.operand)
    || ts.isArrayLiteralExpression(node) && node.elements.every(literal)
    || ts.isObjectLiteralExpression(node) && node.properties.every((property) => ts.isPropertyAssignment(property)
      && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      && !['__proto__', 'constructor', 'prototype'].includes(property.name.text) && literal(property.initializer))
    || (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))
      && literal(node.expression);
  const walk = async (relative: string): Promise<void> => {
    const directory = relative ? await checked(root, relative) : root;

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;

      if (entry.isDirectory()) {
        await walk(name);
      } else if (entry.name.endsWith('.config.ts')) {
        const filename = await checked(root, name);
        const tree = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
        const statement = tree.statements[0];

        if (
          tree.statements.length !== 1
          || !statement
          || !ts.isExportAssignment(statement)
          || !literal(statement.expression)
        ) {
          throw new Error('Dump configurations must export literal data');
        }
      }
    }
  };

  await walk('');
}

/** Adopt file-only sources without changing registry keys; DB content wins over stale copies. */
export async function reconcileDumpElements(sourcesRoot: string, siteId: string, documents: string): Promise<void> {
  const files = new FileRenderingSourceAdapter(sourcesRoot);
  const stored: IRenderingElementState[] = [];

  for await (const { collection, document } of databaseRecords(documents)) {
    if (collection === 'rendering_elements') {
      const { _id, ...fields } = document;

      stored.push(readElement({ ...fields, elementId: _id }));
    }
  }
  const located = await files.locate(siteId);
  const fallback = located ? await new FileElementFallbackAdapter(files).list(siteId, stored) : [];
  const backup = new FileElementBackupAdapter(sourcesRoot, files);

  for (const element of [...stored, ...fallback]) {
    await backup.write(element);

    if (fallback.includes(element)) {
      const { elementId, ...state } = element;

      await appendFile(documents, JSON.stringify({
        collection: 'rendering_elements',
        bytes: encodeDocument({ _id: elementId, ...state, backupState: ElementBackupState.Ready }),
      }) + '\n');
    }
  }

  // Sequence reservation already skips existing keys; retain captured sequences, including gaps.
  for (const kind of Object.values(TemplateSourceKind)) {
    const elements = [...stored, ...fallback].filter((element) => element.kind === kind);

    if (new Set(elements.map((element) => element.key)).size !== elements.length) {
      throw new Error('Duplicate restored element key');
    }
  }

  const normalized = documents + '.normalized';
  const output = await open(normalized, 'wx', 0o600);

  try {
    for await (const row of databaseRecords(documents)) {
      const bytes = row.collection === 'rendering_elements'
        && row.document.backupState !== ElementBackupState.Ready
        ? encodeDocument({ ...row.document, backupState: ElementBackupState.Ready }) : row.bytes;

      await output.writeFile(JSON.stringify({ collection: row.collection, bytes }) + '\n');
    }
    await output.close();
    await rename(normalized, documents);
  } finally {
    await output.close().catch(() => {});
    await rm(normalized, { force: true });
  }
}
