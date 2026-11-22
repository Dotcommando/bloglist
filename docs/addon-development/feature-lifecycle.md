# Add-on feature lifecycle

Use this workflow in the add-on's own repository for features, behavior changes
and bug fixes. Start with its instructions, the [add-on standards](README.md)
and the applicable parts of the
[shared development lifecycle](../cms-development/feature-lifecycle.md).
Keep the agreed behavior and verification evidence in the owning project.

## 1. Define the change and host requirements

Record the target CMS, SDK and add-on versions independently. For an existing
installation, identify the runtime the host actually selected. Describe the
initiating actor, trusted site, supported entry points, observable outcome and
recovery from denied, failed or uncertain operations. Establish which contracts
the host already supports and record any required CMS or SDK work separately.

## 2. Design at the owning boundaries

Identify the add-on's data and migration ownership, SDK calls, effects and
concurrency rules. For each affected HTTP route, state its admission and data
scope. For role-controlled interfaces, keep screen and control requirements with
the Actions they depend on and confirm the target host supports those bindings.
Review the [code standards](code-standards.md), [authorization](authorization.md)
and the relevant [host contracts](README.md).

## 3. Select proof for each behavior

Map the normal, denied and failure cases to the test level that proves them.
Use application tests for business decisions, isolated database and host tests
for the boundaries they own, and Playwright for changed browser flows. Include
installation or update, revocation, race and retry cases where the change relies
on those guarantees. Follow the [add-on testing matrix](testing.md).

## 4. Implement one observable change at a time

Use the shared [backend TDD cycle](../cms-development/testing-policy.md#backend-tdd-cycle)
for backend behavior. Build through the add-on's normal composition and SDK
entry points. Include the migrations, route declarations and administrative
assets that belong to the change. Use the owning project's format, lint,
typecheck and build commands.

## 5. Verify the built runtime

Build and [package the runtime](runtime-packages.md#build-and-publish). Install
or update it on an isolated instance of the target host, connect it to a test
site, and [verify the selected version and digest](runtime-packages.md#verify-the-selected-runtime).
Run the chosen checks through the actual entry points. When the host supports
the affected authorization model, use real role assignments to verify allowed
and denied API and browser paths. Tie results to the tested artifact and host.

## 6. Record release evidence and hand off

Record the source revision, target versions, runtime digest, commands, executed
cases, outcomes and pending prerequisites. For an update, record the chosen
mode, migration evidence and recovery route. Follow the owning project's
release process and the [publication and update instructions](runtime-packages.md).
The isolated verification proves the tested artifact. Deployment to a site is
an operation owned by that site project.
