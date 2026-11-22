# Draft update responses require read access

ID: `pages/draft-update-response-read-scope`. Kind: vulnerability. Status:
fixed and verified in the 0.16.0 working tree. Recorded 2026-11-19. Reproduced
on `469ff6c` during 0.16.0 development. Earlier releases were outside the
verification scope.

The admin HTTP draft update serialized the entire saved page using write
authority alone. An authorized writer lacking read access to a synthetic draft
received stored fields that were absent from the update, including metadata.
The same disclosure occurred when the writer's read scope covered only their
own drafts and the updated page had another creator.

Resolve the read scope independently and match it to the saved object's site,
creator or group. A successful write without matching read scope returns a
receipt. The admin link explains how to obtain the read grant for interactive
editing. The response must reflect read authority even when write authority
already permits the mutation.

See the [HTTP adapter regression](../../../test/adapters/admin-content-http.spec.ts),
[real session and browser regression](../../../test/integration/admin-users-http.integration.spec.ts),
[verification](../../changes/0.16.0/page-edit-access/50-verification.md) and
[authorization contract](../../arch/admin-authorization.md).
