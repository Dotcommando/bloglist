import { LoaderPhase } from '../pages/page-rendering.js';
import { parseSnippetCachePolicy } from '../publication/request-cache.policy.js';
import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { parseElementParameters } from './parameter-contract.policy.js';
import { type ISnippetSource, SnippetExecution } from './snippet.js';

export function parseSnippetSource(value: unknown, compiled = false): ISnippetSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid Snippet source');
  }

  const raw = Object.fromEntries(Object.entries(value));
  const execution = Object.values(SnippetExecution).find((mode) => mode === raw.execution);

  if (raw.execution !== undefined && execution === undefined) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid Snippet execution mode');
  }
  if (
    typeof raw.code !== 'string'
    || !Array.isArray(raw.phases)
    || raw.phases.some((phase) => !Object.values(LoaderPhase).includes(phase))
    || Object.keys(raw).some((key) =>
      !['code', 'output', 'phases', 'execution', 'cache', ...(compiled ? ['compiledJavaScript'] : [])].includes(key))
    || compiled
    && raw.compiledJavaScript !== undefined
    && typeof raw.compiledJavaScript !== 'string'
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid Snippet source');
  }

  return {
    code: raw.code,
    ...(raw.cache === undefined ? {} : { cache: parseSnippetCachePolicy(raw.cache) }),
    ...(execution === undefined ? {} : { execution }),
    output: parseElementParameters([raw.output])[0]!,
    phases: raw.phases,
    ...(compiled && typeof raw.compiledJavaScript === 'string' ? { compiledJavaScript: raw.compiledJavaScript } : {}),
  };
}
