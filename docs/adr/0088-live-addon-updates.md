# 0088. Live add-on updates and process retirement

Date: 2026-11-16

Status: Accepted for 0.15.0

## Decision

The installation coordinator must not execute installed add-on code. Add-on
execution belongs to replaceable CMS-owned serving/control processes. Keep the
public gateway, authentication admission and process supervision independent of
those processes. Business packages remain outside the clean CMS distribution.

Updates are explicit authenticated administration operations. Preserve existing
connections, configuration, business data and immutable package directories.
Validate the candidate, its source identity, greater implementation version,
dependencies and migration checksums before changing the selected generation.
Retain the expected current digest and operation identity for conflict detection
and reconciliation after a lost response. A timeout is not proof of no update.

Replace processes only after a replacement reports readiness. Temporarily allow
one additional serving process for a site, including a site allocated one
process. This is an update allowance, not a permanent CPU allocation or a new
resource-derived process cap. Failure to start a candidate preserves the ready
old process; do not report a completed update for a degraded replacement.

Stop new admission to each retiring process. Send the affected add-on a shutdown
request containing the reason and UTC deadline. Allow up to 20 seconds for its
acknowledgement and outstanding work to finish. After the deadline terminate the
retiring process and confirm exit. JavaScript callbacks cannot preempt a blocked
event loop; the independent coordinator owns the hard deadline. Forced exit may
interrupt work in that process and must be reported as such.

The shutdown contract includes background work and owned resources. Host shutdown
also closes add-ons. Preserve current close-based cleanup while adding an explicit
shutdown context; add-ons must observe their asynchronous work and may not claim
completion while leaving it running. Pending commands retain their own durable
idempotency/reconciliation obligations after forced termination.

## Data and availability

Old and new generations may overlap only under a declared compatible update.
Incompatible migrations require temporarily stopping admission to the affected
add-on and fencing old generation writes before migration. Other CMS/site
functionality remains available. Unchanged content/release identity does not
authorize replacing published artifacts or exposing drafts.

Keep rollback of a runtime selection distinct from rollback of schema/data.
Never automatically reverse applied migrations or rewrite their checksums.
Keep repository installation claims and previous package identities recoverable.

## Verification

Use isolated synthetic packages in core tests. Cover one/multiple processes,
readiness failure, hung shutdown, forced exit, concurrent updates, lost replies,
permission/site boundaries and migration failure. Verify business compatibility
in separate consuming installations with Bloglist and Events; do not register
them in the clean CMS checkout. Leave persistent local startup to the owner's IDE.
