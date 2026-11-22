# Scope and accepted outcomes

Owner request: commit and push the completed previous review, then continue in
the same branch/target 0.15.2. Review all 38 current operations in addons,
calibration, deployment and hooks, including real inbound consumers and used
adapter methods, under [existing-feature-review](../../../cms-development/existing-feature-review.md).

Preserve current approved capabilities and clean-CMS separation. Find architecture,
business/failure/authority bugs and missing substantive evidence. Tests prove
accepted and rejected behavior, effects, ownership, concurrency/recovery and
resource lifetimes; remove only assessed useless or redundant checks while
preserving unique guarantees. Actual backend fixes require executed RED/GREEN;
relevant actual integrations must run before completion.

External add-on sources and deployment peers are controlled synthetic/local
fixtures. Do not install business add-ons into this distribution or contact paid
or production services. Test destinations are owned isolated dependencies; no
full-suite, persistent owner-app startup, release/deployment or owner-data reset.
An authorized Git push is separate from product deployment.

Follow existing error/recovery contracts. Internal resources remain owned by
code; no empty success, log-only handling or useless operator JS-object action.
If a material policy remains unresolved after investigating current precedent,
ask the owner rather than inventing a fallback. Record confirmed bugs and
vulnerabilities selectively with regressions, prevention and final numbered list.
