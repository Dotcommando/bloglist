# Add-on runtime Actions

Feature for CMS `0.16.0`, branch `0.16.0`, baseline `76aea86`.
The owner approved runtime-bound Action registration, HTTP and write authorization,
UI bindings, local Events and Inbox `1.0.0` branches, and isolated site restoration.
The two add-on branches each have a locally built `1.0.0` candidate. The full
site archive was restored against its matching `0.15.3` schema, then upgraded
to `0.16.0` and both candidate packages. The `cms-test-site` project holds the
final selection, isolated database configuration and digest evidence.

The requested implementation and local verification are complete. Publishable
versions are pending the owner's separate release decision. See
[behavior](10-behavior.md), [boundaries](20-existing-behavior.md),
[design](30-design.md), [cases](40-cases.md) and [verification](50-verification.md).
