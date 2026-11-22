# ADR 0076: Page metadata tabs and Open Graph image selection

Date: 2026-11-10

Status: Accepted through the owner's editor and local-installation update request.

HTML page editors always show Main, SEO and Open Graph tabs. The TV tab remains
conditional on assigned fields. This supersedes ADR 0064's no-tabs behavior for
HTML templates without TVs. Non-HTML documents retain their existing main form.
H1 stays on Main beside the page title. SEO pairs its title with the indexing
choice; descriptions use full width. Open Graph places image selection and type
in two columns above its description, stacking on narrow screens.

Keep all panels mounted so draft buffers, saving and publication include hidden
fields. Keyboard arrows, Home and End traverse the available tabs; native form
validation reveals the panel owning the invalid field before focus moves there.
Language changes preserve the selection and data.

Reuse the existing image-library dialog for Open Graph, including search, upload,
cancel, authentication and refresh. New selections choose the largest prepared
image output no wider than 1200 pixels when available; otherwise the smallest
sized public output, or the sole dimensionless vector output. Resolve a relative output against the configured public site origin,
independently of the administration address or current Local serving mode. An
absolute public CDN output remains usable. Missing public origins/outputs and
invalid protocols fail visibly without replacing the current value. Do not guess
HTTPS from a domain or store a private administration preview address.

Preserve the existing nullable absolute-HTTP(S) ogImage contract and previously
saved URLs. A single media-file control displays the filename and an inline
thumbnail when available. Clicking the field, or pressing Enter/Space while it
is focused, opens the image library; an inline clear button removes the draft
selection. It occupies the same single control row as ordinary form inputs.
There is no inert URL textbox or separate chooser row;
no migration, automatic content rewrite, API contract or publication change is
introduced. Page draft save and publication remain explicit actions. Shared
library updates reach the mounted TV editor so its media-version fence stays
current after an Open Graph upload.

The shared media-file input has Image and ImageSize variants. Image shows the
chosen logical image only. ImageSize adds single-choice radio chips beneath the
field, labelled with each output's actual width and height in pixels. These are
existing ready outputs; selection never generates new files. Dimensionless
outputs show Original rather than invented dimensions. Keep every available
size; do not truncate the catalogue or expose technical output keys as labels.

Open Graph always uses ImageSize and stores the chosen output's public URL.
Opening an existing value loads library metadata and restores its exact size;
neither mounting the form nor changing interface language rewrites a saved URL.
The TV Single binding uses the same chips and stores its existing fileId/key
shape. Responsive keeps the logical-image binding and omits chips. Replacing or
uploading an image applies the default only to the new selection. Existing
missing references remain visible and are not silently repaired.

The controls-gallery request was explicitly canceled; no gallery route or demo
page is introduced.

The existing TTL warning remains one rule covering 1–20 seconds. Show it beside
the lifetime field with a visible tinted background. The owner's screenshot
shows 0.11.0; the warning belongs to 0.12.0, which is transferred to the authorized
local site installation after verification.
