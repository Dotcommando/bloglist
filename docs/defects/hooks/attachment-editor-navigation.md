# Hook attachment left the editor on the previous route

- ID `hooks/attachment-editor-navigation`
- Confirmed bug. Fixed in 0.16.0 working tree on 2026-11-20.
- Observed while implementing the [interface resolutions](../../changes/0.16.0/rbac-abac/interface-access-resolutions.md). Earlier affected releases are undetermined.

Assign a draft to an available site hook as a user with subscription access.
The server acknowledges the subscription, but the workspace remains on the
hook card. The editor navigation ran while the global workspace busy guard
still rejected route changes. Both the combined action and the form for an
existing handler called the same attachment path.

Release the busy guard before navigating to the acknowledged subscription.
For a failed attachment after successful draft creation, keep the draft
available and let the operator retry through the existing handler selector.

The [real browser regression](../../../test/integration/admin-users-http.integration.spec.ts)
`creates Hook drafts and assigns subscriptions through independent grants`
compares the new route with the actual subscription identifier returned by
the server. See the [verification evidence](../../changes/0.16.0/rbac-abac/50-verification.md#interface-recommendation-20-hook-handlers-and-subscriptions).
