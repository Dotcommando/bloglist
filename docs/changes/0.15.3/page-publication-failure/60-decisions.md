# Decisions

- Owner explicitly requested branch 0.15.3 and a CMS correction if confirmed.
- Nested paths and `.php` suffixes remain supported literal URLs. The confirmed
  failure concerns retained favicon classification, not a path restriction.
- Reuse the existing exact favicon classifier. A generic link exemption would
  weaken asset ownership and is unnecessary.
- Preserve partial saves and reconcile reads without replaying uncertain writes,
  under the current error/recovery and publication contracts. No new policy choice
  is needed. The owner's follow-up explicitly authorizes release and both site
  code updates; it does not authorize content import or automatic publication.
