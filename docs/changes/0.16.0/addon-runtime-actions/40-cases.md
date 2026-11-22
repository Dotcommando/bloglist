# Verification cases

| ID | Behavior | Level |
| --- | --- | --- |
| ADDON-ACTION-01 | Runtime and manifest agree on method and template. Mismatches reject before instantiating or selecting the runtime. | Package adapter |
| ADDON-ACTION-02 | Activated Actions appear once by ID. Compatible updates preserve grants, removed Actions retire, and failed activation preserves the prior catalog. | Real runtime and MongoDB |
| ADDON-ACTION-03 | Allowed and denied requests bind the selected runtime, site and actor. Denial precedes body read. | Real host HTTP |
| ADDON-ACTION-04 | Own, Groups and All constrain the owning operation where declared. Revocation prevents a later or stale write. | Real storage and HTTP |
| ADDON-ACTION-05 | Synthetic read-only user opens a bound screen and sees guidance for saving. Direct save is denied and an already open screen cannot act after revocation. | Playwright with real role editor |
| ADDON-ACTION-06 | Events and Inbox packages integrate on the restored test site, preserving current data and public and delegated workflows. | Isolated site with both packages |
