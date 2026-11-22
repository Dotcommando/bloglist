# Completed add-on update shown as a candidate

ID `addons/completed-update-shown-as-candidate`. Confirmed bug, reproduced on
0.16.0 in the Add-ons screen and fixed on the 0.16.1 branch.

After an add-on update completes, the browser can retain its operation ID. Open
the catalog again with that ID, including after a later update changed the
selected version. The old transition reappears under the file update form,
giving contradictory version information alongside the active add-on card.

Restore unresolved operations on their own cards and clear completed browser
references. The status API and immutable receipts remain available to reconcile
an interrupted apply. The operator can check status or retry the same prepared
identity while a failure remains unresolved.

See the [browser regression](../../../test/integration/addon-live-updates.integration.spec.ts)
in the compatible repository update scenario with a lost apply response, the
[update contract](../../arch/live-addon-updates.md#administration) and the
[verification record](../../changes/0.16.1/addon-card-updates/50-verification.md).
The isolated Chromium regression passed on the 0.16.1 implementation.
