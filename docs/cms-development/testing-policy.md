# Testing and verification policy

This policy owns general test obligations and execution rules for the
[feature lifecycle](feature-lifecycle.md). Capability contracts own their specific
guarantees and fixtures; [security verification](security-verification.md) owns
adversarial scenarios. Choose checks by observable behavior and risk, not a target
line-coverage percentage or the number of tests.

## Select the level that proves the guarantee

| Level | What to prove | Limits |
| --- | --- | --- |
| Domain unit | Invariants, transitions, accepted/rejected values, boundary dates and exact arithmetic where relevant | Does not prove storage or transport behavior |
| Application unit with deterministic fake ports | Authorization/scope, orchestration, port inputs, results, failure propagation and simulated recovery | Retain after real adapters are bound; does not prove durability |
| Adapter unit | Protocol/schema translation, validation, error mapping, bounded work, streaming and cancellation | Technical doubles cannot prove database guarantees |
| Composition | Inbound-token resolution, factories and provider wiring, including overrides | Resolution alone does not prove the real request path |
| Isolated integration | Actual inbound composition and real adapters; HTTP/session, persistence, indexes, transactions and concurrency as applicable | Uses explicit isolated dependencies, never unrelated data |
| Browser/manual | User-visible flows, real interactions, layout, keyboard/focus and accessibility | Report the method; a source inspection is not a browser result |

Backend feature development and behavior changes follow TDD, including domain,
use-case and adapter behavior. Every bug fix needs an observable regression. Keep
useful existing tests and add checks at the real boundary for guarantees that fake
ports cannot prove. Test selection and the TDD cycle below are mandatory before
implementing backend behavior, not a documentation step after implementation.

## Backend TDD cycle

Work in one small observable behavior at a time:

1. **RED:** Choose a scenario from the feature's `40-cases.md`. Write a unit test
   at the owning domain/application/adapter boundary and execute that exact test
   against the unchanged behavior. Confirm the intended behavioral assertion fails;
   an import, compilation, setup or environment failure does not establish RED.
   Record the command, scenario and observed failure in `50-verification.md`.
2. **GREEN:** Make the smallest complete production change that satisfies the
   agreed behavior, then execute the selected test and affected nearby cases.
   Do not weaken assertions, replace real behavior with a success stub or expand
   the contract merely to turn the test green. Record the observed result.
3. **REFACTOR:** Improve the passing code only where needed, preserving behavior
   and rerunning affected tests after edits. Record the result, or record that
   no refactoring was needed. Then select the next behavior and return to RED.

Use deterministic fake outbound ports for application tests; preserve those tests
when real adapters are composed. Before changing adapter behavior, execute its
failing boundary unit test. Add integration coverage alongside the affected use
case/adapter, and reproduce defects at the real integration boundary when only
real wiring/storage/process behavior can expose them. Such integration evidence
does not turn mocked database assertions into proof of a real guarantee.

Pure composition/packaging defects may require a failing real-boundary regression
rather than an artificial unit test with no behavioral value. State why in the
scenario mapping; still observe RED before fixing the defect, GREEN after it and
the applicable refactor checks. Documentation, types, enum declarations and barrel
exports alone do not require a fabricated RED test. Runtime effects of those
changes are tested through the behavior that consumes them.

If a suitable existing test already reproduces the missing behavior, execute and
use it instead of duplicating it. Tests added around already-correct existing
behavior are characterization/coverage work; report them as such, not as a TDD
cycle or a reproduced bug. Do not invent RED evidence after implementing a change.
Expose the current step and resume details using the
[feature dossier convention](feature-lifecycle.md#feature-knowledge-and-resume).

## Which backend unit tests to write

| Owner | Required behavioral assertions for the changed scenarios |
| --- | --- |
| Domain rules | Accepted/rejected transitions and boundary values; derived results, date/time or exact arithmetic when owned here; invariants remain true after rejection |
| Application use case | Accepted result and intended state/effect; denied actor/foreign scope; invalid or missing/conflicting references as applicable; port failure and partial/uncertain outcome handling; no forbidden effect after rejection |
| Stateful/concurrent orchestration | Stale versions, receipt/retry decisions, cancellation, losing races and resource release for affected paths; deterministic gates/fake clocks, not sleep-based guesses |
| Inbound adapter | Untrusted protocol input to validated use-case input, trusted actor/site resolution, error/status mapping and admission before body/expensive work |
| Outbound adapter | Mapping of domain values to allowed provider operations and back, malformed/provider-error handling, streaming/admission/cancellation/cleanup where applicable |

Assert results, persisted intentions/effects and meaningful ordering constraints.
Port-call assertions are useful when they prove a business input, an authorization
boundary or absence of a forbidden effect, not simply that a method was called.
Do not force every use case to contain every category; map applicable scenarios
and explain material omissions in `40-cases.md`. Avoid a duplicate test for each
layer that merely reasserts the same constant or mapping without an added guarantee.

## Which backend integration tests to write

For every new inbound use case, add a focused scenario through actual composition
and real affected outbound adapters. Update the same coverage when behavior
changes. Exercise the actual HTTP dispatcher and session lifecycle for networked
operations; use the real owning invocation boundary for non-HTTP operations.

| Changed boundary | Integration evidence |
| --- | --- |
| New/changed inbound operation | Successful invocation with an observable real result/effect; relevant denial/foreign-scope and validation/error translation through the actual route/composition |
| Persistence and migrations | Real round trip/ownership queries, actual unique indexes and validators, transaction commit/rollback and resulting shapes where changed |
| Version/concurrency/idempotency | Competing real writes, stale conflict and replay/uncertain-outcome reconciliation when the contract relies on database guarantees |
| Auth/private/public delivery | Real session acceptance/revocation and absence of protected reads/writes or private output through applicable entry points |
| Files/workers/processes/external protocol adapters | Real owned I/O or controlled local peer/child process for effects unavailable to unit doubles; applicable disconnect/failure/cleanup paths |

Use the detailed boundary requirements below and owning contracts; these tables
are selection rules, not a demand to repeat every unit input combination through
HTTP/MongoDB. Integration tests prove the boundaries that can fail despite passing
unit tests. Do not replace the application, persistence or authorization under
test with fakes and label the result real integration. Unrelated external peers
may be controlled local fixtures; state the exact boundary being verified.

For example, a guarded site-owned edit needs unit evidence for the mutation and
denied/stale paths with fake ports. Its integration checks prove real actor/site
scoping, persistence and the actual concurrent version guard. Neither enum-value
assertions nor importing the use-case class proves those guarantees.

## Required scenario selection

For each affected operation, select applicable checks for:

- Accepted behavior and its externally observable result or state transition.
- Invalid/boundary input, missing/conflicting references and preserved invariants.
- Denied authority and foreign scope, including absence of reads/writes or work
  that the caller must not trigger; apply security-verification.md.
- Dependency failure, partial work, uncertain commit, stale version and retry.
- The defined user/operator error outcome and applicable recovery path from
  [feature design](feature-design.md#error-outcomes-and-recovery): truthful failure
  status, safe actionable feedback, preserved input/state and a safe next step.
  Check the owning result/adapter boundary and the browser/job/CLI consumer where
  appropriate; a log assertion alone does not prove error handling.
- Concurrent operations, cancellation/disconnect and resource cleanup when these
  exist in the affected workflow. Use controlled gates/fake clocks rather than
  timing guesses; observe all sibling/losing Promises and cleanup outcomes.
- Preserved behavior of affected consumers, caches and publication/read paths.

Add focused integration coverage with each new inbound use case and update it
for changed existing behavior. Run the relevant integration tests and require
them to pass before completing the feature. There is no five-use-case execution
cadence. Provider overrides supplement, rather than replace, real adapter wiring.
An integration run may be unnecessary for a change with no integration effect
(for example documentation or purely visual CSS); explain significant omissions.

## Proof at specific boundaries

| Affected boundary | Required evidence |
| --- | --- |
| MongoDB persistence/migrations | Isolated real MongoDB for transactions, validators, uniqueness/indexes, ownership queries and concurrent writes as applicable; verify resulting shapes/indexes after the affected migration batch |
| HTTP authentication/admission | Real dispatcher wiring and early rejection before body reads/expensive work; assertions are defined in security-verification.md |
| File delivery and backpressure | Multi-chunk transfer, large-file HEAD/304 without body work, missing/foreign resources, immutable writes and malformed/truncated input; disconnect while write returns false must settle the handler, execute iterator cleanup and remove drain listeners; also verify normal drain/resume |
| Rendering | Escaping, typed forwarding/defaults, lexical isolation, missing/cyclic dependencies, phases/errors, site isolation and atomic publication for affected paths |
| Generated CSS/assets | Validate production HTML/CSS, final placement and computed styles/geometry across affected shorthand/reset/variable/conditional/layer/override cases; exercise minified/obfuscated JS when affected |
| Admin interaction | Desktop/narrow layout, keyboard/focus, labels, zoom, overflow, loading/error/empty/success states and relevant iPhone Safari behavior; inspect related controls together and verify touch targets against admin instructions |
| Admin trees/scroll panes | Browser checks for top/scrolled/reset shadows, independent panes and folder disclosure versus selection when affected |
| Workers/processes/packaging | Real process or final-image checks for guarantees unavailable to unit doubles; follow the owning contracts and scripts/AGENTS.md |
| Performance | Measure the claimed metric under stated conditions; actual CLS when assessing layout shift; unit/build results do not establish performance |

Specific fork fault fixtures and prerequisites remain in
[publication/failure tests](../arch/fork-publication-and-failure-tests.md).
Release image/service-user verification remains in
[tooling instructions](../../scripts/AGENTS.md). Do not replace these checks with
a generic successful build or invent a second copy of their scenario lists.

## Regression and prevention after a defect

For each confirmed bug or vulnerability, retain a focused observable regression
under the TDD rules above and update the [defect record and routing index](../defects/record-format.md).
Prove the original failure and corrected outcome, including the error/recovery path
and related boundary cases where affected. A vulnerability regression must prove
the forbidden effect is absent, not just that an error status is returned.

Link the exact regression files/scenario names and actual RED/GREEN evidence from
the record. Reuse a suitable existing reproducer rather than duplicating it.
Historical imports must cite their original evidence and distinguish missing or
unexecuted checks; never invent past RED runs. Record creation does not replace
executing the affected tests or updating the owning behavior/security contract.

## What does not need a separate test

Do not add tests whose only assertion is:

- A symbol/class/function is exported by a barrel/index file, exists or imports.
- An enum member equals its declared string/number or a constant equals its literal.
- A type/interface has the declared shape at compile time, a constructor exists,
  DI metadata is present or a trivial getter returns its assigned property.
- A mock returns its configured value, an implementation calls its own private
  helper, or a shallow snapshot matches incidental markup/internal structure.

Do not mirror the implementation, retest framework/third-party internals or
duplicate an existing check without additional behavioral evidence. Compilation,
typechecks and architecture checks cover declarations/import boundaries. Actual
module resolution through production composition remains a valid wiring check;
a barrel-export inventory does not replace it.

If an enum/constant participates in a real external serialization or compatibility
contract, verify the produced/accepted message or persisted representation at that
boundary. Do not add a test just to reread the enum declaration. A test is useful
when a plausible contract-breaking change would make it fail for the right reason.

### Examples of tests written only to increase test counts

The snippets below are illustrative, not CMS API names. The problem is the missing
behavioral guarantee, not the assertion syntax. Use the replacement only where
that guarantee belongs to the changed contract; do not mechanically add every row.

| Low-value test | What it fails to prove | Meaningful check instead |
| --- | --- | --- |
| `expect(exports.SavePage).toBeDefined()` or `expect(typeof save).toBe('function')` | That an actor can execute a valid operation through the intended boundary | Exercise the operation and assert its result/effect; use type/build checks for export declarations |
| `expect(Status.Draft).toBe('draft')` or `expect(MAX_ITEMS).toBe(100)` | That status transitions or an input limit are enforced | Test accepted/rejected transitions or inputs at/over the agreed limit; test an actual external representation if it is contractual |
| `expect(new Service(mock)).toBeInstanceOf(Service)` | That production composition resolves usable dependencies or performs work correctly | Resolve the real inbound token and execute a meaningful scenario through its dependencies |
| Configure `repo.save` to return an object, call `repo.save` directly and expect that same object | Anything about production code; only the test double was exercised | Invoke the production use case/adapter and assert the intended result and relevant state/effect |
| Write a test-only `IPageCreationPort` implementation that calls `insertOne`, pass it to the repository and assert that helper's insertion payload | That the actual production creation adapter enforces site/language, identity, numbering or transaction rules; the interesting behavior was invented in the fixture | Keep a repository delegation check, then exercise the real creation adapter and use isolated integration tests for its database guarantees |
| Assert that `module.get(Symbol.for('OPTIONAL_BUSINESS_OPERATION'))` throws when no such token exists anywhere in the product | That a real capability or forbidden authority is absent from this composition; any arbitrary unknown token would pass | Check an actual production token that must be unavailable in this mode, or invoke the real boundary and prove the prohibited operation cannot execute |
| After an update, assert only `expect(repo.save).toHaveBeenCalled()` | Correct site/entity/version, changed data or absence of unauthorized writes | Assert the approved mutation and trusted scope/version, plus denied/stale cases with no forbidden effect |
| Spy on `service.normalizeInput` and assert it was called | Correct normalization; harmless internal refactoring breaks the test | Supply representative input and verify the public result or accepted/rejected persisted value |
| Compute `expected` with the same helper/algorithm used by production code | A shared defect changes actual and expected together | Use independently specified examples and boundary values derived from the contract |
| Assert only `decode(encode(value))` equals `value` | That either side follows the external format; both can share an incompatible encoding | Check independently known encoded/decoded examples, invalid input and interoperability where required |
| A create/update HTTP test asserts only status 200/201 | Correct response, persisted data, ownership or exactly-once effect | Assert the response and real owned state; use contract-specific conflict/retry checks where applicable |
| An anonymous/foreign-site request asserts only 401/403/404 | That rejection happened before a private read, body consumption, expensive work or a write | Assert the relevant forbidden effects did not occur, through actual dispatcher wiring where required |
| `expect(result).toBeTruthy()`, `.toBeDefined()` or `.not.toThrow()` is the only assertion for a workflow | That the result has the required meaning or that the intended effect happened | Assert the business result, invariant or effect; absence of an exception alone may conceal empty success |
| A rejection test uses an empty `catch`, never fails when the call resolves, or does not await/return the Promise assertion | That rejection was observed at all; the test can pass on the wrong path | Await the exact rejection assertion and verify preserved state/cleanup as applicable |
| An integration test replaces the real transaction with a fake and asserts `commit`/`rollback` call counts | Real MongoDB atomicity, index enforcement or rollback | Keep orchestration checks at unit level; prove database guarantees with isolated real writes and resulting state |
| A source-text test checks `source.includes('authorize')`, a decorator name or the presence of `finally` | Reachable authorization or cleanup on success/failure/cancellation | Exercise denied access or controlled failure/disconnect and verify the actual boundary/effect/resource lifetime |
| A broad object/HTML snapshot or another identical happy-path case is added without identifying a new guarantee | Intentional behavior versus incidental structure, or additional risk coverage | Assert specific contract fields/interactions or a missing boundary/failure case; retain snapshots only for an explicit stable output contract |

Before adding a test, name the contract-breaking defect it should detect and the
observation that would expose it. If it only restates a declaration, confirms a
mock setup or stays green when the claimed behavior is removed, omit or redesign
it. This is not permission to remove existing tests without assessing what they
protect, or to replace meaningful architecture/compatibility regressions.

Reversible low-impact visual edits may use focused browser verification
instead of new automated tests. These exclusions never waive a bug regression or
an affected invariant/security check. Explain an omitted material scenario and
the evidence used instead; do not delete a useful test just to meet this policy.

## Isolation and execution

Run affected tests only, with explicit files and name filters where applicable.
Never run the full suite without an explicit request. For example:

```sh
npm test -- test/architecture.spec.ts
npm test -- test/clean-distribution.spec.ts -t "clean"
npm run test:integration -- test/integration/resource-security.integration.spec.ts
```

Select actual files/names for the task; the examples are not a mandatory test set.
Integration tests require an explicit `ZARYA_TEST_MONGO_URI`; transaction tests
need a transaction-capable instance. Use guarded, uniquely named `zarya_test_*`
databases and private temporary directories. Validate the resolved target before
cleanup and close connections, test servers, child processes and other owned
resources on success and failure. Never reset unrelated/production data. Verify
core with isolated synthetic fixtures, not an installed business capability.
Never apply synthetic fixtures to site/production data or silently call paid/live
services from tests.

Browser integration requires `ZARYA_TEST_BROWSER_EXECUTABLE`. Build the server
before real fork fixtures that load `dist/`. Follow declared Windows/Linux
requirements; a platform skip does not count as verification. Follow the root
AGENTS.md restrictions on persistent apps and dependency services.

## Source checks and documentation-only work

After source changes run `npm run format`, resolve diagnostics, then `npm run lint`,
plus relevant typecheck, build and architecture checks. Select checks for the
affected workspaces/boundaries. After they pass, broaden/repeat only for new edits,
failures or unresolved concerns. A build alone is not feature verification.

Documentation-only changes need consistency, relative-link/anchor, whitespace and
applicable version checks against package/release metadata. Do not run application
suites or claim runtime behavior was verified by reading documentation.

## Report evidence honestly

Report commands/files, outcomes and prerequisites, separating automated checks,
manual/browser observations and source review. Distinguish passed, failed,
pending/skipped and not applicable with a reason. Required checks that cannot run
remain pending; do not complete the feature as fully verified. Keep credentials,
local settings and private evidence out of tracked reports. Save feature evidence
under the [dossier convention](feature-lifecycle.md#feature-knowledge-and-resume).
Use [existing-feature review](existing-feature-review.md) for a
requested maintained audit.
Completion reports follow the [defect summary format](feature-lifecycle.md#defect-summary-in-the-completion-report).
