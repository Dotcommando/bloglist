# Add-on testing and release evidence

Follow the shared [test levels and TDD cycle](../cms-development/testing-policy.md),
[security verification](../cms-development/security-verification.md) and
[documentation checks](../cms-development/testing-policy.md#source-checks-and-documentation-only-work).
Select tests for the behavior and the integration boundary affected by the
change. Add-on unit tests and host integration runs prove different guarantees.

## What to verify

| Boundary | Required evidence when affected |
| --- | --- |
| Business operation | Deterministic application tests with fake ports for the intended effect, site scope, forbidden paths, concurrency outcomes and failure or retry behavior. |
| Owned database and migrations | Isolated MongoDB coverage for actual validators and indexes, site predicates, committed shapes, stale writes, rollback and atomic receipts. Verify the exact packaged migration bytes and result. |
| Actual host integration | Run the affected operation through the real packaged add-on and intended REST, admin, CMS extension or hook boundary. Prove provider resolution, session/site context and declared access class through real composition. |
| Connection lifecycle | Exercise enabled, disabled, retained and unavailable behavior as applicable. Use competing real writes to show that a stale connection permit cannot commit after a winning fence change. |
| Server extension and public output | Verify input/result shapes, public field projections, size and paging bounds, and that a Query invocation rejects effects even through nested calls. |
| Browser administration | Exercise actual host navigation and action feedback, including denial, busy states and recovery. Follow the [administration boundary checks](../cms-development/testing-policy.md#proof-at-specific-boundaries). |
| Runtime and distribution | Verify packaged entry points, manifest declarations, actual selected version and digest, owned migration receipts, lifecycle cleanup and restart/overlap behavior where relevant. Use the [packaging instructions](runtime-packages.md) and [image/release rules](../../scripts/AGENTS.md). |

Use isolated fixtures, disposable data and the intended dependency versions.
Use the separate Synthetic runtime for generic CMS extension regressions. Keep
business package and site fixtures in their owning projects. An override can
isolate an unrelated peer. The host authorization, dispatch or storage boundary
being verified needs its real implementation. Record the commands, artifacts,
versions, executed cases and remaining prerequisites separately.
Use the project's format, lint, typecheck and build scripts for changed source
under the [shared source checks](../cms-development/testing-policy.md#source-checks-and-documentation-only-work).

## Authorization for 0.16.0

These checks apply to the [action registration contract](authorization.md).

- Compare the packaged action declarations to registered method and route pairs,
  including public routes. Test missing registration, foreign namespace, unknown
  domain and duplicates, including two templates differing only by a parameter
  name. Confirm invalid metadata cannot activate a package or change grants.
- Send protected requests through the actual dispatcher with missing or denied
  authority. Check rejection before consuming a body or starting expensive work,
  and prove there is no protected read, write or business side effect. Include
  wrong-site and mismatched or forged object/group references.
- Exercise own, group and all access where the endpoint supports them. Verify
  list/search filters and counts before pagination; check direct and composite
  operations and the isolation of private and public projections.
- Test role and group revocation across processes and a race between revocation
  and an in-flight write. For site-owned add-on effects, verify both the
  authorization guard and the connection fence in the committing transaction.
- On update, prove unchanged actions retain their grants and additions,
  replacements and retired routes require the intended policy. Exercise rejected
  activation, compatible overlap or exclusive pause at the real host boundary
  wherever the package relies on them.
- For [bound administration screens](authorization.md#bind-screens-and-controls-to-actions),
  install the packaged add-on, assign roles through the host and sign in as a
  delegated user. Verify menus, nested screens, direct links, enabled controls
  and conditional hints under different grants. Withdraw a grant after the screen
  has opened and verify the next protected request is denied. Record which host
  capabilities are available for this test.
