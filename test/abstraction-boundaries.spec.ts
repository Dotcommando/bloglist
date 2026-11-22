import { readFileSync } from 'node:fs';

import ts from 'typescript';

function parsed(filename: string): ts.SourceFile {
  return ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
}

function interfaceFields(filename: string, name: string): string[] {
  const declaration = parsed(filename).statements.find((node) =>
    ts.isInterfaceDeclaration(node) && node.name.text === name);

  if (!declaration || !ts.isInterfaceDeclaration(declaration)) {
    throw new Error('Missing contract ' + name);
  }

  return declaration.members.map((member) => member.name?.getText() ?? '');
}

describe('refactored abstraction boundaries', () => {
  it('keeps local source paths and administration navigation out of inner contracts', () => {
    expect(interfaceFields('src/domain/publication/render-plan.ts', 'IFrontendSource')).not.toContain('directory');
    expect(interfaceFields('src/domain/media/file-library.ts', 'IMediaUsage')).not.toContain('editorPath');
    expect(interfaceFields('src/domain/media/file-library.ts', 'IMediaUsage')).toContain('target');
    expect(readFileSync('src/ports/outbound/media/file-library.port.ts', 'utf8')).not.toContain('editorPath');
  });
  it('composes owning site operations instead of implementing them in the factory', () => {
    const source = parsed('src/infra/cms/cms-operations.factory.ts');
    const matches: ts.ObjectLiteralExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node)
        && node.name.getText() === 'sites'
        && ts.isObjectLiteralExpression(node.initializer)
      ) {
        matches.push(node.initializer);
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
    expect(matches).toHaveLength(1);

    for (const [name, implementation] of [['list', 'ListSitesUseCase'], ['resolve', 'ResolveSiteUseCase']]) {
      const property = matches[0]!.properties.find((node) => node.name?.getText() === name);

      expect(property && ts.isPropertyAssignment(property) && ts.isNewExpression(property.initializer)
        && property.initializer.expression.getText()).toBe(implementation);
    }
  });
  it('leaves recipient ordering, limits and add-on lifecycle selection out of persistence and composition', () => {
    const events = readFileSync('src/adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.ts', 'utf8');
    const capture = events.slice(events.indexOf('async capture('), events.indexOf('async recordCheck('));

    for (const policy of ['.sort(', '.filters', '.priority', '128', 'cms.addon.enabled', 'cms.addon.disabled']) {
      expect(capture).not.toContain(policy);
    }
    const composition = readFileSync('src/infra/hooks/hooks.providers.ts', 'utf8');

    expect(composition).not.toContain('recipients.push');
    expect(composition).not.toContain("keys.includes('cms.addon.");
  });
});
