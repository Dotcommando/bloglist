# Administration coverage-gap review

Reviewed baseline: 084c36b, branch 0.16.0, 2026-11-18. Scope: supported controls
in Pages, Templates, Chunks, Snippets, TVs, Files and URLs; include Templates
because they are part of the owner's site-building flow. This is interaction
coverage, not a whole-product security audit or a Cartesian product of inputs.

Inventory comes from PageEditor, SourceWorkspace/ElementEditor/ParameterFields,
TemplateVariablesWorkspace/TvValueEditor, FilesWorkspace and UrlsWorkspace,
their maintained contracts, and actual assertions in integration/browser suites.
No new product capability is authorized by an absent test.

| ID | Interaction / evidence at baseline | Gap and selected additional proof |
| --- | --- | --- |
| C01 | Page create/edit/publish/cancel, compare/restore inputs, tree moves, MIME, metadata and noindex already covered | Keep existing checks; add independent sitemap exclusion/re-inclusion with index retained and clear OG image through real UI/public output |
| C02 | Draft/public Markdown and JSON-LD actions have localized JSON-LD checks in admin-i18n outside the gate | Add Markdown dialog distinction, escaped content and failed-read retry in selected page suite; do not duplicate full JSON-LD workspace |
| C03 | Templates/chunks have creation, basic parameters, names, search, preview, backup, conflicts, apply and unsaved buffers | Add Number/Boolean/Enum/Object/Array contracts, null versus absent defaults, kind changes and parameter removal through controls and save/reload |
| C04 | Snippet code/result and ParallelRead enable/reload already covered | Add Build/Request phase selection, public cache seconds conversion/bounds, clearing opt-ins and structured result editing |
| C05 | TV creation/assignments/default consumption/image picker/clearing/missing values covered | Add definition edit/type/default/order/removal/reload, all four types and actual required-publication rejection/correction; image/file defaults through real library |
| C06 | File backend replacement/move/delete and browser rename/force-delete/copy are covered | Add actual UI multi-file queue cancellation and per-file modes, replacement bytes/geometry with stable identity/URL, document URL/download and folder creation |
| C07 | File reference update/keep choices, drag/drop and clipboard failure already covered in files-layout | Reuse, without another equivalent synthetic test |
| C08 | URL redirects, history, virtual folders and parent-only moves covered; children promotion without redirects exists only in backend routing tests | Add actual UI child promotion without redirect plus occupied-path rejection retaining input, corrected resubmission and unsaved-navigation cancel/discard |
| C09 | Shared responsive, keyboard/focus, source Back, hidden panels and tree behaviors covered | Preserve; investigate hierarchy scroll suite outside selection before claiming an absent test |
| C10 | Core denial/stale/concurrency cases exist below the browser | Add only missing interaction outcomes; no duplicated security audit or obsolete software support |

Excluded capabilities: no rendering-element deletion workflow exists. Site/user/
add-on/hook/deployment management, full JSON-LD configuration and Safari execution
are outside these requested sections/platform scope. The existing Windows
headless Chromium gate remains the selected execution platform.

Follow-up results and exact scenario names are recorded in 50-verification.md.
Rows above describe the pre-addition gap. All mapped cases passed in the final
140-case release gate; exact timings and intermediate failures are in verification.

## Implemented follow-up mapping

| IDs | Executable coverage |
| --- | --- |
| C01 | [Real metadata journey](../../../../test/integration/admin-metadata-journey.integration.spec.ts): retain index while excluding/reincluding sitemap; clear SEO/OG text and selected image, verify rendered fallbacks/omitted tags and saved controls |
| C02 | [Page editor](../../../../test/integration/admin-rendering-ui.integration.spec.ts): saved/public Markdown and JSON-LD, escaped content, Escape/Cancel, no implicit save, unpublished disablement and failed-read recovery |
| C03 | [Shared element editor](../../../../test/integration/admin-rendering-ui.integration.spec.ts): nested Object/Array/Enum, Array item type and typed default, false/zero/null/absent, kind change, removal, invalid JSON/correction, reload |
| C04 | Same editor: Build/Request phases, invalid 0/3601 cache seconds, 17 seconds serialized as 17000 ms, structured Object result, cache removal and ParallelRead return to Sequential |
| C05/C10 | [Real TV journeys](../../../../test/integration/admin-tv-journey.integration.spec.ts): four definitions, Markdown/Image/File defaults from actual library, escaped Text, required publication refusal/correction, caption/help/order/type/default/removal, immutable name and actual competing-save 409/reload |
| C06 | [Real Files journey](../../../../test/integration/admin-files-journey.integration.spec.ts): new folder, queue cancellation/modes, invalid image in a partial batch and retry, replacement with stable URL and changed bytes/geometry, document public URL, actual clipboard/download |
| C07 | Existing [Files layout](../../../../test/integration/files-layout.integration.spec.ts): reference update/keep and dialog cancellation retained |
| C08 | [Real URLs journey](../../../../test/integration/admin-urls-journey.integration.spec.ts): occupied address refusal without overwrite, input preservation, cancel/discard, child promotion without redirects and real HTTP verification |
| C09 | Existing [hierarchy selection](../../../../test/integration/admin-hierarchy-scroll.integration.spec.ts) now selected: 6 sections at desktop/mobile widths, actual scroll retention assertions |

Fifteen new executable cases (10 focused editor cases and 5 real journeys),
plus 12 existing hierarchy cases newly included in the release command. The
existing TV fixture also gains an accessible-name assertion. This mapping
identifies covered supported interactions; it does not claim every input,
permission/browser combination or unrelated administration section is covered.

The next owner-requested continuation closes the explicitly enumerated remaining
scenarios in [N01-N21](80-remaining-scenarios.md): additional real runtime chains,
TV/media conflicts, replacement/folder operations, routing rejections and recovery
from disconnect/timeout/lost acknowledgement/expired session in every listed
editor. The earlier 140-case figures above are historical. Current final results
and selected worker budget are recorded in verification.
