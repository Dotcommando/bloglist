import {
  type ISnippetConcurrencySettings, validateSnippetConcurrencySettings,
} from '../../app/services/publication/snippet-scheduler.service.js';

export function readSnippetConcurrencySettings(environment: NodeJS.ProcessEnv): ISnippetConcurrencySettings {
  const settings: Partial<Record<keyof ISnippetConcurrencySettings, number>> = {};
  const names = {
    perRender: 'ZARYA_SNIPPET_PARALLEL_PER_RENDER',
    perProcess: 'ZARYA_SNIPPET_PARALLEL_PER_PROCESS',
    queueLimit: 'ZARYA_SNIPPET_PARALLEL_QUEUE_LIMIT',
    queueWaitMs: 'ZARYA_SNIPPET_PARALLEL_QUEUE_WAIT_MS',
  } as const;
  const keys: readonly (keyof ISnippetConcurrencySettings)[] = ['perRender', 'perProcess', 'queueLimit', 'queueWaitMs'];

  for (const key of keys) {
    const value = environment[names[key]];

    if (value !== undefined) {
      if (!/^\d+$/.test(value)) {
        throw new RangeError(`${names[key]} must be an integer`);
      }
      settings[key] = Number(value);
    }
  }

  return validateSnippetConcurrencySettings(settings);
}
