# Verification cases

| ID | Guarantee | Level |
| --- | --- | --- |
| J01 | Login, create site and first page, draft/save/reload/publication | Real browser journey |
| J02 | Create/edit template, extract chunk, simple breadcrumbs/pagination Snippets and verify rendered values | Real browser journey + focused source editor suite |
| J03 | Upload original/responsive media, assign image TVs, single/responsive bindings and actual public image delivery | Real browser journey + focused image/TV suites |
| J04 | SEO/Open Graph save/edit/reload and published metadata | Real browser journey + focused page editor suite |
| J05 | Indexing toggle changes publication/sitemap membership | Real browser journey + URLs/sitemap suite |
| J06 | URL move with redirect and deletion; frozen content remains | Real browser journey + real URL suite |
| J07 | Nested virtual paths become real pages; children remain accessible | Real browser journey + real URL suite |
| J08 | Favicon retained with Request page during incremental content/routing publication | Journey + existing real publication regression |
| J09 | Empty/loading/error/conflict/cancel, keyboard, responsive controls, preview/backup feedback | Existing focused browser suites |
| J10 | Isolated bounded parallel execution, explicit prerequisites and truthful failure exit | Release command execution |
| J11 | Mobile More -> Save draft reveals and focuses invalid field without writes | Focused source-editor browser regression |
| J12 | Independent Files name/folder saves preserve the other pending buffer after confirmation | Real Files UI regression with owned resources |
| C01 | Exclude/reinclude sitemap independently from robotsIndex; clear SEO/OG overrides and image, verify public fallbacks | Real metadata journey |
| C02 | Saved/public Markdown and JSON-LD are escaped readonly dialogs; preserve local input, disable unavailable publication, retry read failure | Focused page browser suite |
| C03 | Nested Object/Array/Enum parameters, item type/default, Number zero/Boolean false, null/absent defaults, malformed JSON correction, removal | Shared Template/Chunk browser editor |
| C04 | Snippet phases, public cache min/max and seconds conversion, structured result, disable cache and parallel opt-ins | Shared Snippet browser editor |
| C05 | All TV types/defaults, real required-value rejection/correction, rename/help/order/type/default/remove/reload | Real TV journey |
| C06 | Folder creation, per-image queue modes, cancel, partial failed batch/corrected retry, stable replacement URL and bytes, document clipboard/download | Real Files journey |
| C08 | Occupied URL refusal preserves input; cancel/discard navigation; promote children without redirects | Real URLs journey |
| C09 | Selection preserves tree scroll at desktop/mobile widths for Pages/Templates/Chunks/Snippets/Files/URLs | Existing hierarchy suite added to gate |
| C10 | Losing TV catalog writer sees 409, retains input and reloads winning values | Two real browser pages, shared session |
| R01 | Array item type/default replacement reaches parent contract | Built recursive ParameterFields regression; observed RED before fix |
| R02 | Default image picker retains its field caption as accessible name; section/control IDs do not collide | Built TV default regression; observed RED before fix |

No new backend feature or security policy is introduced. Characterization tests
around existing correct behavior do not manufacture TDD RED evidence. If a real
defect is reproduced, record RED before fixing its owning behavior.

The second continuation implements [remaining scenarios N01-N21](80-remaining-scenarios.md)
with seven real browser files: page details, elements runtime, TV interactions,
media mutations, routing rejections, content recovery and file/URL recovery.
Twenty-two new executable cases cover the matrix; the recovery cases each exercise
disconnect, timeout, lost acknowledgement and expired-session recovery. Existing
TV persistence/version and Request-cache hit/miss/bypass suites join the gate.
