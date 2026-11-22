# Decisions

The implementation follows the agreed card workflow and exact-package source
linking. The separate proposal to update and link a previously unbound source
requires its own trust and transaction contract.

An attached package must match active bytes, so a matching version alone does
not establish identity. The current URL parser and release verification remain
the authority for remote input. Browser persistence is a recovery hint. The
selected runtime remains the authority for the displayed current version.
