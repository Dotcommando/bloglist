# Design

Reuse the repository installation command with an explicit installed add-on key. Authenticate the actor and initiating site before download. Validate the canonical URL and package through the existing bounded GitHub pipeline. Require the package key and verified digest to match the selected runtime before reserving a claim. Complete the claim without calling activation. Existing immutable claims and their retry path remain authoritative. A concurrent later runtime update cannot cause this flow to select a previously active digest.

On the admin side, use existing controls and one review/status flow for file and repository proposals. Match package and saved proposal to its card. Retain the applied update identity for reconciliation, clear terminal success and ignore stale/mismatched prepared proposals. Verify browser storage and HTTP errors without exposing secret or internal diagnostics.
