# ADR 0045: Stable Cloudflare site deployment output

Date: 2026-10-31

Status: Accepted through the owner's request to implement CMS integration without
performing a deployment. This records the Cloudflare direction discussed after ADR 0044.

## Decision

Provide one local PrepareSiteDeployment operation through AppModule, invoked by
cdn:prepare and deploy:cloudflare. It captures the selected site's active
publication once, reuses checksum-verified public artifacts, reads named public
media through the media capability's application operations and prepares the
fixed deploy/public directory. It never publishes drafts, executes Build Snippets,
starts a persistent application server or seeds a business capability.

Keep site identity, Worker name and public/backend origins in site-owned
cloudflare.json. Keep the clean CMS's registries empty. Generated output, credentials
and site configuration are not committed to the distribution.

Build a new complete output separately, then replace the previous generated tree
under an exclusive preparation/upload lock. Preserve one previous complete local
export as a recovery buffer; remove it on the next preparation. Verify directory
ownership before replacement/cleanup and reject symbolic links. A failed build
before installation preserves the prior output. Unknown upload outcomes are
reported as failures, not as acknowledged deployment success.

The generated Worker routes static documents to Cloudflare Assets and adds their
precomputed CSP hashes. CSS/JS and media can use the platform's direct asset path.
Generate document redirects and Request paths from the publication route catalog.
Request pages, APIs and administration use the ordinary current Node.js backend.
There is no Worker-to-CMS release pinning or new cross-platform transaction.
Each backend rendering still selects one publication internally as before.

For proxied requests, restore the public Host only after verifying an explicitly
configured shared edge secret. Do not trust arbitrary forwarded hosts or grant
administrator authority from proxy authentication. Preserve normal session,
Origin, site-ownership and add-on business checks. Responses for API, administration
and Request documents use no-store. Public asset misses may go to the origin,
including resources requested by a browser that already has older HTML.

Cloudflare Static Assets cannot store individual files larger than 25 MiB.
Report those named public media paths as origin-served rather than changing the
CMS's accepted upload limits. Oversized publication documents fail preparation.
Private originals, Request plans, manifests, diagnostics and settings are excluded.

Use exact-version Wrangler tooling and the same deployment command for every
update. Provision the edge secret with the Worker upload through a temporary
private JSON file, removed on completion or failure. Dry-run compiles/checks the
Worker without uploading it. Actual deployment remains an explicit command.

## Consequences

Internal immutable publication storage remains unchanged. Operators no longer
select release directories or edit Wrangler paths. The site export is complete
for static documents and their copied resources; live business operations stay
on the backend and do not require redeployment after each reservation.

Cloudflare deployment history is separate from CMS content/business data.
Do not add release rollback UI, garbage collection of existing publication
archives, business data rollback or an R2/D1 storage migration in this task.
See [the implemented contracts](../arch/cloudflare-deployment.md).
