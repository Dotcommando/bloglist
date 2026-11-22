const modulePath = '../../admin/src/features/deployment/deployment-api.ts';

const module: unknown = await import(modulePath);

if (
  !module
  || typeof module !== 'object'
  || !('readDeploymentStatus' in module)
  || typeof module.readDeploymentStatus !== 'function'
) {
  throw new Error('Missing deployment status reader');
}

const reader = module.readDeploymentStatus;

function readDeploymentStatus(input: unknown): { readonly diagnostic: unknown } {
  const result: unknown = reader(input);

  if (!result || typeof result !== 'object' || !('diagnostic' in result)) {
    throw new Error('Invalid deployment status result');
  }

  return { diagnostic: result.diagnostic };
}

describe('administration deployment diagnostics', () => {
  const status = {
    target: null,
    version: 'v1',
    activeReleaseId: 'release-1',
    state: 'OutcomeUnknown',
    attempts: 1,
    retryAt: null,
    delivered: null,
    diagnostic: {
      issue: 'Backend',
      retryable: false,
      stage: 'PublicVerification',
      reason: 'HttpStatus',
      httpStatus: 400,
      recovery: 'CheckBackendAndReconcile',
    },
  };

  it('retains safe stage, HTTP status and recovery while dropping undeclared provider fields', () => {
    expect(readDeploymentStatus(status).diagnostic).toEqual(status.diagnostic);
    expect(readDeploymentStatus({
      ...status, diagnostic: { ...status.diagnostic, providerBody: 'secret' },
    }).diagnostic).toEqual(status.diagnostic);
  });

  it.each([
    { stage: 'arbitrary' }, { reason: 'private provider response' }, { recovery: 'arbitrary' },
    { httpStatus: 999 }, { httpStatus: 400.5 },
  ])('rejects malformed diagnostic fields: %j', (fields) => {
    expect(() => readDeploymentStatus({
      ...status, diagnostic: { ...status.diagnostic, ...fields },
    })).toThrow('Invalid deployment diagnostic');
  });
});
