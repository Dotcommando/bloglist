# ADR 0016: Site selection and a session-bound administration workspace

Date: 2026-10-25

Status: Accepted by the owner in the administration workspace discussion.

## Decision

Extend the existing Svelte administration under ADR 0001. After authentication,
show creation of the first site when the site list is empty; otherwise show the
site list and a create button. Opening a site establishes an explicit UI scope
and displays its pages beside the working area. Returning to the site list is
always available. Existing global active administrators continue to manage all
sites under ADRs 0011/0012; this task adds no account, role or entitlement policy.

On desktop (992px and wider), retain a left page drawer and a larger editor.
Below 992px, the two panels each fill the available viewport below the shared
header and slide together horizontally. Circular chevron controls switch panels.
Page selection and creation open the editor automatically. Inactive mobile panels
are inert and hidden from assistive technology. Both remain mounted so switching
panels preserves form values. Reduced motion disables the transition.

An empty page list contains only the square create button. It opens creation of
the first draft with a default title of Home (localized in the UI). Existing
pages can be read and their title/Markdown draft content saved. The existing
Page has no parent field; the initial tree therefore has one level, with keyboard
navigation. No page-parent model, drag/drop, URL hierarchy or reordering is added.
The first draft does not assign a URL, change a release or publish content;
address assignment and publication remain their existing separate operations.

Expose only the existing CreateSite, GetSite, ListSites, CreatePage, GetPage,
ListPages and UpdatePage operations over REST/JSON under `/api/admin/sites`.
This supersedes their local-only entry restriction for these seven operations;
local composition and all application contracts remain intact. Other operations
remain at their existing boundaries. Site creation accepts the established site
fields; page creation accepts mark/language/title/contentMd. Draft editing accepts
only title/contentMd. No generic object update, rendering or publication fields
are accepted by this boundary.

## Authorization and composition

A capability-owned composition factory creates existing use cases against shared
real repositories and a request-owned access adapter. Controllers receive only
inbound operation interfaces through that factory. The immutable cookie token
belongs to one request; no global mutable identity or local-operator provider is
bound. Access ports resolve GetCurrentAdminUser, caching its result only inside
that request. Inactive, deleted, version-invalid or revoked sessions fail through
the existing session contract. Non-empty site assignments fail closed until their
own policy is implemented. Site IDs in routes select resources and do not confer
permission. Page reads/edits enforce both site and page identity in existing use
cases, and foreign-page results translate to 404 without exposing content.

Reuse the existing exact Host/Origin, custom-header, JSON, HttpOnly cookie and
no-store protections. This boundary adds no CORS grant or authentication fallback.
Encoded body limits are recorded in `docs/arch/transport-limits.md`; list results
retain their complete existing contracts without invented pagination/truncation.
Migrations, database ownership and page/site concurrency guarantees are unchanged.
