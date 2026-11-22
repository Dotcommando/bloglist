# Verification

Baseline cb5495d. Executed style RED: real browser computed `none/solid` instead
of expected `underline/dotted` at both 1440/320px, before class correction.
Host release preflight: gateway 21 assertions passed; three tooling files passed
five assertions; seven real Docker image import/failure scenarios passed.
Intermediate max-line lint diagnostic was corrected before completion.
Host format/lint/typecheck/build passed; Svelte reports zero diagnostics. All
four affected real-browser scenarios passed, including computed dotted styling
and preserved Escape/outside/reopen/viewport behavior.
Clean Linux preflight passed from committed candidate `13532aa`, with pinned
Node 26.7.0/npm 11.19.0 in image
`node:26.7.0-bookworm@sha256:e929171d35b9df7773a3ec5b068e387fa109441dc90f91e6560af5d39b7e9bf1`.
It cloned only committed source into disposable storage, executed npm ci,
release consistency/tag metadata, typecheck/lint/build, all 21 gateway and five
tooling assertions, then packed source and verified detached checksum and the
complete extracted inventory. It printed `LINUX_RELEASE_PREFLIGHT_PASSED`.
The first attempt's temporary mount was noexec; it stopped at npm postinstall
before source verification. Retrying with an executable test-owned tmpfs passed;
no product code or install-script policy was weakened to bypass it.
Docker's seven service-user/negative-image scenarios were executed separately
against the real Linux Docker targets and passed. No database/full suite was run.
The existing npm advisory and Vite chunk-size notices are not failed checks;
dependency advisory reachability was not assessed and pins were retained.
## Hosted publication

Branch `0.15.2` was pushed, then merged into master using a normal non-fast-forward
merge. Immutable annotated tag `v0.15.2` targets full commit
`df90e5fa902e52d8603bb480f440a31f65af4e1a`.
[Master gateway](https://github.com/Dotcommando/cms-zarya/actions/runs/44301738524)
completed successfully. The actual
[release run](https://github.com/Dotcommando/cms-zarya/actions/runs/44302190993)
completed successfully with every metadata/install/type/lint/build, gateway,
tooling, real Docker import/failure, packaging/checksum/inventory and publication
step marked success. No failed hosted run/re-tag/force push was needed.

[Published release](https://github.com/Dotcommando/cms-zarya/releases/tag/v0.15.2)
is neither draft nor prerelease. Archive and detached checksum assets were
downloaded from that release and verified against GitHub's digests and each other.
Archive SHA-256 is
`6a1c9662eaf790b56bd5f1e7551eab3320fc1a3ba1a0c24c1e1e49c53d29d93f`;
verified extracted payload checksum is
`7b6059a2c068801099d5446a681e1fc521bc3d7269deb42a8f3ff566ce519c9b`.
It matches the preflight merge tree's payload; compressed archive bytes need not
match a different platform's locally produced tar/gzip container.

## Local installation

Consumed the actual published artifact after hosted success, preserving site
identity/configuration, selected Events 0.4.5 and all data. Twenty-two protected
files (environment, six pre-existing owner files, fifteen JSON migrations) retain
their before-update hashes. Runtime source bytes match the published inventory.
Events passed the real compiled checksum/host-dependency validator unchanged.

Site format (with three owner test files excluded), lint, full typecheck, native
build and read-only migration verification passed. All four affected real-browser
scenarios and thirteen installation assertions across three explicit site test
files passed. Both local Docker targets built, then fresh network-disabled
checks imported each actual role as UID 1000 and asserted package version,
source commit, payload checksum and built admin provenance. App/helper were
recreated without starting them; original MongoDB remains running.

The update was committed locally in the site checkout as
`2f3936a9de3272c6c9676e69420cd80b8a29f59e` (221 reviewed update paths). Exactly six
cookie-notice owner files remain separate and uncommitted. No site push,
production access/deployment, content publication, data restore or calibration
was performed. The earlier unrelated site-editing fixture failures were not
rerun or claimed resolved here.

The site commit's broader staged whitespace gate found blank EOF lines in 27
imported Markdown files. Only those blank endings were normalized in the site
and current CMS documentation; contract text, migration bytes and runtime code
were preserved. This editorial cleanup and post-publication closure are committed
after the immutable release; the published tag/assets remain unchanged.

New defect inventory: [admin/build-info-inline-action-style](../../../defects/admin/build-info-inline-action-style.md),
confirmed product bug, newly discovered in this scope, new card; fixed with
executed RED/GREEN. No confirmed vulnerability in this scoped change.
