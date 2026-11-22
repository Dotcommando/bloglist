# Behavior

An authorized editor can save and publish an HTML page with an explicit template
and a free nested public path such as `/offers/card-gift-123.php`. The suffix is
an address, not executable PHP. URL prefixes need no real directory/page.

Successful publication activates the page and preserves other published pages.
If a later step fails after draft/version/URL persistence, the UI must reconcile
known saved state, preserve the editor's input and distinguish assigned URL from
an active public route. A failure must expose the actionable failed stage or
validated input where available, rather than falsely blaming a missing address.

Investigate and fix the CMS on branch 0.15.3. The owner subsequently authorized
merging to master, publishing 0.15.3, updating the local site and updating production
from the site Git repository. Preserve production data/settings/publications.
Do not publish the owner's gift page, alter robots.txt or import local content.
Crawler exclusion and access control remain separate concerns; do not add a PHP
runtime or implement personal access restrictions.
