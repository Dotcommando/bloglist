# ADR 0033: Show current page URL and public availability

Date: 2026-10-28

Status: Accepted through the owner's report of a green page indicator after its
URL became a redirect, and the requested missing-URL warning on 2026-10-28.

The retained Page PUBLISHED lifecycle state records an available published
version. It does not prove that the active release still serves that page.
Keep retained versions and page lifecycle intact when a URL becomes a redirect.
Administration derives current availability from working PAGE bindings and one
activated release's Static/Request routes. Redirect routes do not publish their
former source page.

GetPublicationOptions additionally returns pageAvailability entries containing
pageId, assignedPath and publicPath. A page-specific request returns that page,
including null paths when unbound. A site request returns the union of working
PAGE bindings and active page routes; omitted pages have neither. Read routing
once per query without catalog concurrency-version lookups or per-page requests.
Keep site/page authorization and ownership checks before exposing routing data.

In the page drawer, red means no assigned working URL; green requires an assigned
URL and an active public page route. Other known states remain gray. Unknown or
failed availability never falls back to the retained PUBLISHED flag; show a
load failure/retry explicitly. Indicators have accessible labels and tooltips.

The page editor badge describes public availability separately from the retained
version. For a missing working URL, show a message beneath Public URL path and
allow entering a new initial address for Save & publish. If working routing
changed but activation failed, explain that the old active route still serves
the page rather than incorrectly claiming it is unavailable.

Refresh availability after routing changes and page/site publication, rejecting
obsolete responses across sites and preserving unsaved page content. Verify the
redirect, red indicator, missing-URL warning, retained draft buffer and return to
green after assigning/publishing a replacement URL through the browser.
