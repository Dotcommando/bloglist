# Schema migrations

Use versioned, checksum-verified migrations for data, validators and indexes.
Migration bytes must use LF in Git, release archives, Docker images and add-on
packages; enforce attributes and verify the exact packaged bytes before applying.
Never normalize/rewrite an applied migration or its receipt. Add a new migration
for subsequent changes. Historical checksum bytes remain data integrity evidence,
regardless of which software version is currently supported.

Disable automatic production schema/index mutation. Migration and transactional
verification follows [testing policy](../docs/cms-development/testing-policy.md#proof-at-specific-boundaries).
Business add-on migrations belong to their own
package/project and receipt namespace, not the clean CMS baseline.
