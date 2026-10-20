import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const modules = ['sites', 'clusters', 'pages', 'routing', 'creators'];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);

    return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.ts') ? [file] : [];
  });
}

describe('Capability boundaries', () => {
  it('organizes the backend by layer before capability', () => {
    expect(readdirSync('src').sort()).toEqual(['adapters', 'app', 'domain', 'infra', 'main.ts', 'ports']);

    for (const module of modules) {
      expect(existsSync(`src/domain/${module}`)).toBe(true);
      expect(existsSync(`src/app/use-cases/${module}`)).toBe(true);
      expect(existsSync(`src/ports/inbound/${module}`)).toBe(true);
      expect(existsSync(`src/ports/outbound/${module}`)).toBe(true);
      expect(existsSync(`src/infra/${module}/${module}.tokens.ts`)).toBe(true);
      expect(existsSync(`src/adapters/outbound/persistence/mongodb/${module}`)).toBe(true);
      expect(existsSync(`src/adapters/outbound/persistence/${module}`)).toBe(false);
      expect(existsSync(`src/${module}`)).toBe(false);
    }
  });

  it('keeps domain, application and ports free of frameworks and cross-capability implementation imports', () => {
    for (const layer of ['domain', 'app', 'ports']) {
      for (const file of sourceFiles(`src/${layer}`)) {
        const fileParts = path.relative(path.resolve('src'), path.resolve(file)).split(path.sep);
        const module = fileParts[layer === 'domain' ? 1 : 2];
        const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

        for (const statement of source.statements) {
          if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
            continue;
          }

          const specifier = statement.moduleSpecifier;

          if (!specifier || !ts.isStringLiteral(specifier)) {
            continue;
          }

          const dependency = specifier.text;
          const target = path.resolve(path.dirname(file), dependency);
          const relative = path.relative(path.resolve('src'), target);
          const targetParts = relative.split(path.sep);
          const targetLayer = targetParts[0];
          const targetModule = targetParts[targetLayer === 'domain' ? 1 : 2];

          expect(dependency.startsWith('.'), `${file}: external dependency ${dependency}`).toBe(true);
          expect(relative.startsWith('..'), `${file}: cross-application dependency ${dependency}`).toBe(false);
          expect(targetModule, `${file}: cross-capability dependency ${dependency}`).toBe(module);
          expect(layer === 'domain' ? ['domain'] : ['domain', ...(layer === 'app' ? ['app', 'ports'] : [])])
            .toContain(targetLayer);
        }
      }
    }
  });

  it('keeps one use-case file per inbound contract and implements only the authorized capabilities', () => {
    const expected: Record<string, string[]> = {
      sites: ['create-site', 'update-site', 'archive-site', 'get-site', 'list-sites'],
      clusters: [
        'create-cluster', 'update-cluster', 'move-cluster', 'archive-cluster', 'get-cluster', 'list-clusters',
        'add-blog-to-cluster', 'update-cluster-blog-placement', 'remove-blog-from-cluster', 'reorder-cluster-blogs',
      ],
      pages: [
        'create-page', 'update-page', 'assign-page-to-cluster', 'publish-page', 'archive-page', 'get-page', 'list-pages',
      ],
      routing: ['assign-initial-page-url', 'change-page-url', 'find-url-by-path', 'get-url-history'],
      creators: [
        'create-blogger', 'update-blogger', 'activate-blogger', 'deactivate-blogger', 'get-blogger', 'list-bloggers',
        'create-blog', 'update-blog', 'activate-blog', 'deactivate-blog', 'reassign-blog', 'update-blog-stats',
        'get-blog', 'list-blogs',
      ],
    };

    for (const [module, operations] of Object.entries(expected)) {
      const files = sourceFiles(`src/app/use-cases/${module}`);

      expect(files.map((file) => path.basename(file)).sort())
        .toEqual(operations.map((operation) => `${operation}.use-case.ts`).sort());

      for (const operation of operations) {
        const implementation = readFileSync(`src/app/use-cases/${module}/${operation}.use-case.ts`, 'utf8');
        const implemented = ['sites', 'routing', 'pages', 'clusters'].includes(module);

        if (implemented) {
          expect(implementation).toContain('export class ');
          expect(implementation).toContain('implements I');
        } else {
          expect(implementation).toBe('');
        }
        expect(readFileSync(`src/ports/inbound/${module}/${operation}.port.ts`, 'utf8')).toContain('execute(');
      }
    }
  });

  it('keeps adapters and composition in their own layers with inward dependencies', () => {
    for (const file of sourceFiles('src')) {
      const parts = path.relative(path.resolve('src'), path.resolve(file)).split(path.sep);

      if (file.endsWith('.controller.ts')) {
        expect(parts.slice(0, 3)).toEqual(['adapters', 'inbound', 'rest']);
      }
      if (file.endsWith('.module.ts') || file.endsWith('.tokens.ts')) {
        expect(parts[0]).toBe('infra');
      }
      if (file.endsWith('.schema.ts')) {
        expect(parts.slice(0, 4)).toEqual(['adapters', 'outbound', 'persistence', 'mongodb']);
        expect(modules).toContain(parts[4]);
      }
      if (parts[0] !== 'adapters' || file.endsWith('.spec.ts')) {
        continue;
      }

      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
          continue;
        }

        const specifier = statement.moduleSpecifier;

        if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) {
          continue;
        }

        const target = path.resolve(path.dirname(file), specifier.text);
        const targetParts = path.relative(path.resolve('src'), target).split(path.sep);
        const targetLayer = targetParts[0];

        if (targetLayer === 'infra') {
          expect(target.endsWith('.tokens.js'), `${file}: composition dependency`).toBe(true);
        } else {
          expect(['domain', 'ports', 'adapters'], `${file}: outward dependency`).toContain(targetLayer);
        }
        if (targetLayer === 'ports') {
          expect(targetParts[1], `${file}: wrong port direction`).toBe(parts[1]);
        }
        if (targetLayer === 'adapters') {
          const integrationDepth = parts[1] === 'outbound' ? parts.length - 1 : 3;

          expect(targetParts.slice(0, integrationDepth), `${file}: another adapter implementation`)
            .toEqual(parts.slice(0, integrationDepth));
        }
        if (parts[1] === 'outbound' && ['domain', 'ports', 'infra'].includes(targetLayer)) {
          const targetCapability = targetParts[targetLayer === 'ports' ? 2 : 1];

          expect(targetCapability, `${file}: another capability implementation`).toBe(parts.at(-2));
        }
      }
    }
  });

  it('declares business enums only in domain and keeps DI tokens as leaf constants', () => {
    const enums: string[] = [];

    for (const file of sourceFiles('src')) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

      for (const statement of source.statements) {
        if (ts.isEnumDeclaration(statement)) {
          expect(file.split(path.sep)).toContain('domain');
          enums.push(statement.name.text);
        }
        if (file.endsWith('.tokens.ts')) {
          expect(ts.isVariableStatement(statement)).toBe(true);
        }
      }
    }

    expect(enums.sort()).toEqual([
      'SiteStatus', 'ClusterStatus', 'PageType', 'PageStatus', 'UrlKind', 'UrlRedirectStatus',
      'BloggerType', 'BloggerStatus', 'BlogPlatform', 'BlogStatus',
    ].sort());
  });
});
