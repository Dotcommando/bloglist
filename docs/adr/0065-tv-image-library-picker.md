# ADR 0065: Image-library picker for TV fields

Date: 2026-11-07

Status: Accepted through the owner's CMS 0.10.1 prototype request.

Replace the image TV's file select with a current preview and Choose image or
Replace button. A separate Remove image action clears the draft override under
ADR 0064. Keep image-binding and alternative-text controls. File TVs retain their
existing selection control.

The button opens a modal image library for the current site. Use the shared native
CMS dialog with a wider variant, filename search, image thumbnails, dimensions,
selected state, an explicit Use image action and Cancel. Cancel and Escape leave
the TV unchanged and restore focus. Search Enter must not submit the page form.
Missing previews have an explicit fallback and do not prevent image selection.

Reuse ListMediaFiles without changing its complete-catalog contract. Search the
entire image catalog case-insensitively. Render 48 results initially, show the
visible and matching counts and offer Show more in batches of 48. Load thumbnail
images lazily from prepared public outputs through authenticated admin delivery.
The batch size limits rendered controls, not API results or search coverage.

Upload one new image through the existing guarded raw-file upload operation,
using the current media version, the image root and Responsive processing. A
successful ready upload updates the library/version and selects the new logical
file in this TV draft. Preserve the selected binding mode and resolve a Single
binding's output key from the newly returned file metadata. Do not replace the
binary contents of the previously selected logical file or save/publish the page.

Disable upload/selection/closing while an upload is pending. Show errors inside
the dialog, preserve the previous TV value on failure and do not replay uploads
automatically. Refresh is explicit, including after conflicts. An expired session
uses the existing administration authentication boundary. Propagate library
updates to page TV saves so the media-version fence remains current, and to the
TV-definition editor's file metadata.

Editor refinement, 2026-11-07: remove the separate Refresh files button from
the page TV form. It only reread metadata and was easily confused with saving
or publishing. Opening the image library already reads the current catalog;
its own Refresh action remains available for recovery. Save draft and Save &
publish remain the page's persistence/publication actions. Arrange image binding
and alternative text in two columns from 768px, stacking below that threshold.
Reserve a stable scrollbar gutter in the page editor across Main/TV tab switches,
with an always-scroll fallback where scrollbar-gutter is unsupported.

No new inbound operation, backend storage, transport limit, dependency, migration
or publication behavior is introduced. The same picker edits page values and TV
defaults. Verification uses the built administration with synthetic HTTP fixtures
covering a 1000-image catalog, search, bounded rendering, selection/cancellation,
focus, empty/error states, denied/conflicting uploads, successful upload and save,
both interface languages and the shared responsive viewport widths.
