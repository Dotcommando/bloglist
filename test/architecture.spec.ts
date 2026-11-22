import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);

    return entry.isDirectory() ? files(filename) : [filename];
  });
}

describe('inward dependencies and optional site modules', () => {
  it('enforces layer imports, token exceptions and optional custom modules', () => {
    const root = path.resolve('src');
    const modules = new Set(files(root).filter((filename) => /\.(?:ts|json)$/.test(filename)));
    const core = new Set(['sites', 'pages', 'routing', 'publication', 'rendering', 'media',
      'admin-users', 'admin-auth', 'authorization', 'shared', 'addons', 'hooks',
      'installation', 'diagnostics', 'resources']);

    for (const filename of modules) {
      if (!filename.endsWith('.ts')) {
        continue;
      }

      const relative = path.relative(root, filename).split(path.sep);
      const tree = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
      const layer = relative[0];
      const capability = relative.findLast((part) => core.has(part));
      const inspect = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node)
          || ts.isExportDeclaration(node))
          && node.moduleSpecifier
          && ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const specifier = node.moduleSpecifier.text;

          if (!specifier.startsWith('.')) {
            const contracts =
              /^@zarya\/addon-contracts\/(?:addons|hooks|cms|cms-extensions|business-error|validation|cursor-page|snapshot-entity)$/.test(specifier);

            if (['domain', 'ports', 'app'].includes(layer ?? '')) {
              expect(contracts, filename + ' -> ' + specifier).toBe(true);
            }

            return;
          }

          const target = path.resolve(path.dirname(filename), specifier.replace(/\.js$/, '.ts'));
          const targetParts = path.relative(root, target).split(path.sep);

          expect(modules, `${filename} -> ${specifier}`).toContain(target);
          const allowed = layer === 'domain' ? ['domain']
            : layer === 'ports' ? ['ports', 'domain']
              : layer === 'app' ? ['app', 'ports', 'domain']
                : layer === 'adapters' ? ['adapters', 'ports', 'domain']
                  : ['infra', 'adapters', 'app', 'ports', 'domain'];
          const tokenException = layer === 'adapters' && targetParts[0] === 'infra' && target.endsWith('.tokens.ts');

          expect(allowed.includes(targetParts[0] ?? '') || tokenException, filename).toBe(true);

          if (['app', 'adapters'].includes(layer ?? '') && capability && target.endsWith('.repository.ts')) {
            expect(targetParts, `Cross-capability repository import: ${filename}`).toContain(capability);
          }

        }
        if (ts.isCallExpression(node)) {
          expect(node.expression.kind, filename).not.toBe(ts.SyntaxKind.ImportKeyword);
          expect(ts.isIdentifier(node.expression) && ['require', 'eval'].includes(node.expression.text), filename)
            .toBe(false);
        }
        ts.forEachChild(node, inspect);
      };

      inspect(tree);

      if (filename.endsWith('.tokens.ts')) {
        expect(tree.statements.every((node) => ts.isVariableStatement(node)), filename).toBe(true);
      }
    }
  });
});
