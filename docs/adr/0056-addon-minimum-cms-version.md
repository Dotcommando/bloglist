# ADR 0056: Minimum CMS version for add-ons

The owner requires add-ons to support a minimum CMS version and later versions.
The numeric `cmsVersion` in a runtime manifest is therefore the minimum supported
CMS version, superseding the exact-match requirement in ADR 0052. Repository
releases must declare it; runtime packages without the optional field retain their
previous behavior. Installation and startup both reject hosts older than the
declared minimum. The installation record still stores the actual host version.

The runtime dependency versions and their existing exact checks are unchanged.
The minimum declaration does not replace compatibility testing on newer CMS
versions. Earlier CMS versions retain their original exact-match behavior.
