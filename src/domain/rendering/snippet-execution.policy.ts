import { requireCondition } from '../shared/validation.js';
import { SnippetExecution } from './snippet.js';

export interface ISnippetExecutionNode {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly execution?: SnippetExecution;
}

export function orderSnippetExecution<T extends ISnippetExecutionNode>(nodes: readonly T[]): readonly T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: T[] = [];

  requireCondition(byId.size === nodes.length, 'Duplicate Snippet execution identity');
  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }

    const node = byId.get(id);

    requireCondition(node !== undefined, `Missing Snippet dependency: ${id}`);
    requireCondition(!visiting.has(id), `Cyclic Snippet dependency: ${id}`);
    requireCondition(node!.execution === undefined || Object.values(SnippetExecution).includes(node!.execution),
      'Invalid Snippet execution mode');
    visiting.add(id);

    for (const dependency of node!.dependsOn) {
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(node!);
  };

  for (const node of nodes) {
    visit(node.id);
  }

  return ordered;
}
