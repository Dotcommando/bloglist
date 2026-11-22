# ADR 0040: Template variables and logical media references

Date: 2026-10-31

Status: Accepted through the owner's TV discussion and implementation request.

Subsequent decision: [ADR 0054](0054-json-ld-profiles-and-graph-publication.md)
adds JSON-LD profiles over existing fields/TVs, reusable shared objects and typed
graph references for CMS 0.10.0, outside the 0.8.0 scope. It does not change the
current TV types or their implemented behavior.

[ADR 0064](0064-page-tv-editing-and-conditional-tabs.md) simplifies the CMS 0.10.1
editing form: direct inputs, clear-to-default behavior and conditional page tabs.
It retains the underlying REST value and publication contracts.

TV definitions belong to a site and are assigned to one or more templates, as in
MODX. Each page stores its own values. Assignments control the editing form;
markup usage is not inspected and changing templates never deletes values.
Supported types are Text, Markdown, Image and File. Definitions have immutable
technical names, captions, descriptions, ordering, required flags and defaults.
Absent values use defaults, null explicitly clears a value. Required values are
checked at publication, not draft save. Published defaults are captured with the
page version. Restoration restores values without restoring media bytes.

Image values select either one public output of a logical file or the image's
complete responsive set. File values select a logical file and a link caption.
Replacement and movement through Files update the referenced logical object.
Private originals and administration content URLs are never emitted publicly.
TVs trust the existing processing metadata; they do not probe generated files or
revalidate their dimensions. Missing saved references are visible in the editor
and do not prevent saving unrelated edits or publishing. New references must
belong to the selected site. Captured catalog/page/media versions guard editing.

Markdown TV values are trusted administrator content and render without HTML
sanitization, at the owner's explicit request. Ordinary text remains escaped.
The existing main-content Markdown policy is unchanged.

Saving a changed Snippet republishes pages using it, including transitive chunk
dependencies. Rebuild published content only; never promote working drafts.
Failure leaves the previous active release selected and is returned to the
editor. Saving the same Snippet again can retry publication without editing code.

Generic implementation belongs to cms-zarya. Game TV definitions, image
assignments, card layouts and installation scripts belong to katerina-bloom.
Existing named-media mutability, forced deletion and manual filesystem changes
retain ADR 0026's behavior. No media history or automatic broken-link repair is
introduced.
