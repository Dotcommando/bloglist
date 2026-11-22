# Existing behavior

Repository installation and card updates share an outbound delivery adapter. Preserve canonical source, release and artifact identity, admission and staging cleanup from the [add-on contract](../../../arch/site-addons-contracts.md#repository-release-installation). The [staging cleanup regression](../../../defects/addons/failed-staging-cleanup-lost-ownership.md) still applies on GitHub failures. The catalog holds the saved source, while update apply consumes the existing immutable proposal.
