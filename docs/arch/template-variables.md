# Template variables

See [ADR 0040](../adr/0040-template-variables.md). The TV section manages a
site-owned catalog. Each definition has a stable technical name, caption,
description, type, template assignments, ordering, required flag and optional
default. Assignment determines the page editing form; no markup usage analysis
is performed. Changing templates preserves other values.

The four types are Text, Markdown, Image and File. Page values live in `tvValues`
and participate in retained page versions and restoration. An absent key selects
the definition's default; null is explicitly empty. Publication checks required
values and captures effective defaults in the retained version without changing
the editable default selection. Existing publications do not consult new defaults.
Under [ADR 0064](../adr/0064-page-tv-editing-and-conditional-tabs.md), the admin
edits values directly without a value-source selector. Clearing an input removes
its override; a configured nonempty default is announced below the empty input.
Empty assigned values are normalized to absent overrides on page TV save. The
definition editor likewise removes a default when cleared. Existing REST clients
retain the explicit-null contract above.

Image TVs use the [ADR 0065](../adr/0065-tv-image-library-picker.md) library dialog
instead of a file select: thumbnails, full-catalog filename search, batches of 48
visible results and upload of a new responsive image. Selection changes only the
draft; cancel preserves the previous reference. Ready uploads refresh library
metadata and the media-version fence before selecting the new logical file.
The same picker is available for TV defaults. File TVs keep their file select.
The default section heading and value controls have distinct DOM identities;
the image picker is named by its field caption for keyboard/assistive navigation.
Text is escaped. `[[*details:markdown]]` renders a Markdown TV as trusted
administrator HTML. Main content and other Markdown inputs retain sanitization.

Images store `{kind: Image, fileId, mode, alt}` with an output key for Single.
Responsive binds the logical image and its prepared public outputs. Files store
`{kind: File, fileId, label}`. URLs and geometry come from library metadata;
there are no filesystem existence checks or derivative generation in TV code.
Private originals and admin download URLs are not exposed. Output properties
include image `src`, `srcset`, `sources`, `width`, `height`, `alt`, `exists`,
`missing`; file `url`, `label`, `exists`, `missing`. `sources` supports picture
elements with the existing versioned viewport profiles. Width descriptors use
recorded actual widths. The template owns layout, sizes, cropping and loading.

Replace and move in Files resolve through the same identity on editor reload or
the next build. Already published static URLs follow named-media rules and are
not rewritten by a filesystem operation. Deletion may leave a saved broken
reference. The editor shows that state without blocking unrelated saves.
Unchanged references remain saveable; new missing/foreign references are rejected.

| Operation | Input/result | HTTP |
| --- | --- | --- |
| ListTemplateVariables | siteId -> complete catalog/version | GET /api/admin/sites/:siteId/template-variables |
| SaveTemplateVariables | siteId, expectedVersion, complete fields -> catalog | POST same route |
| GetPageTemplateVariables | siteId/pageId -> catalog, values, prepared values, template, page/media versions | GET /api/admin/sites/:siteId/pages/:pageId/template-variables |
| SavePageTemplateVariables | identity, templateId, values, expectedUpdatedAt, catalogVersion, mediaVersion -> page | POST same page route |

AppModule exposes these through TV_OPERATIONS for a trusted local operator.
HTTP composition uses the authenticated content operations, never local authority.
Validation is 400, missing/foreign selection 404, unauthorized access 401/403 and
stale page/catalog/media state 409. Page value saves atomically fence catalog,
media and captured page state inside a transaction. Missing references are not
a publication gate. Concurrent conflicting changes are reported for reload.

Migration 0001 creates template_variables and adds optional page/version values,
publication catalog projections and media fencing. It does not transform old
records or change the applied baseline. Full site dumps include definitions and
page values through their schema-declared site ownership; category-only template
dumps do not implicitly include the site's TV catalog.

An authorized API update of a ready Snippet can rebuild its active direct and
transitive page consumers from retained published page content. This requires
site publication access and an update without `draftOnly: true`. No page
version is created and no working draft is promoted. All affected builds stage
before one guarded activation. Build or activation failure preserves the old
active release and is returned to the caller. Reload the saved Snippet and
save again to retry. The administration editor saves Snippet source with
`draftOnly: true` and requests full publication separately for Save & apply.
