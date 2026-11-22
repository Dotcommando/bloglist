import {
  type ISnippetPoolSettings, validateSnippetPoolSettings,
} from '../../adapters/outbound/rendering/modx/snippet-worker-pool.js';

export function readSnippetPoolSettings(environment: NodeJS.ProcessEnv): ISnippetPoolSettings {
  const settings: Partial<Record<keyof ISnippetPoolSettings, number>> = {};
  const names = {
    size: 'ZARYA_SNIPPET_POOL_SIZE',
    queueLimit: 'ZARYA_SNIPPET_POOL_QUEUE_LIMIT',
    queueWaitMs: 'ZARYA_SNIPPET_POOL_QUEUE_WAIT_MS',
    executionTimeoutMs: 'ZARYA_SNIPPET_POOL_EXECUTION_TIMEOUT_MS',
    memoryBudgetMb: 'ZARYA_SNIPPET_POOL_MEMORY_BUDGET_MB',
  } as const;
  const keys: readonly (keyof ISnippetPoolSettings)[] = [
    'size', 'queueLimit', 'queueWaitMs', 'executionTimeoutMs', 'memoryBudgetMb',
  ];

  for (const key of keys) {
    const value = environment[names[key]];

    if (value !== undefined) {
      if (!/^\d+$/.test(value)) {
        throw new RangeError(`${names[key]} must be an integer`);
      }
      settings[key] = Number(value);
    }
  }

  return validateSnippetPoolSettings(settings);
}
