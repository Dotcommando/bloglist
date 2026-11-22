import { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';

it('transfers an explicit noncacheable result from a fresh Worker invocation', async () => {
  const pool = new SnippetWorkerPool();
  const onUncacheable = vi.fn();
  const context = {
    siteId: 's',
    pageId: 'p',
    language: 'en',
    phase: LoaderPhase.Request,
    preview: false,
    signal: AbortSignal.timeout(5000),
    onUncacheable,
  };

  try {
    const code = 'async function __snippet(input, context) { context.cache.bypass(); return "fallback"; }';

    expect(await pool.execute(code, {}, context)).toBe('fallback');
    expect(onUncacheable).toHaveBeenCalledOnce();
    onUncacheable.mockClear();
    await pool.execute('async function __snippet() { return "fresh"; }', {}, context);
    expect(onUncacheable).not.toHaveBeenCalled();
  } finally {
    await pool.onModuleDestroy();
  }
});
