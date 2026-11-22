# Page metadata and URL suggestions

See [ADR 0023](../adr/0023-page-slugs-and-seo-fields.md).

## Creation-time suggestions

`Second Page` suggests `/second-page/`; `Русское название страницы` suggests
`/russkoe-nazvanie-stranitsy/`. Suggestions follow title input until the user
edits the public path. A saved page's title never drives its path, even when no
URL has been assigned yet. The first home page keeps `/`.
New forms start with a real `/` value at site root, or the selected parent page's
assigned URL followed by `/`. Title suggestions append their slug inside this
prefix. Changing Parent page updates an automatic suggestion; a manually edited
path is preserved. An unassigned parent falls back to the root prefix.

Normalize Unicode to NFC before transliteration, lowercase, transliterate Russian,
decompose Latin accents, collapse other character runs into hyphens, and trim
leading/trailing hyphens. Preserve digits. A title with no supported letters or
digits leaves the parent/root prefix in the field. An assigned parent's unchanged
prefix requires a child slug before publication. URL uniqueness/reserved-path validation remains authoritative
in routing/publication; suggestions do not silently add numeric suffixes.

Initial URL settings are applied at publication as in ADR 0019. Saving a draft does not
reserve the suggested URL. The editor does not regenerate a missing address on
reopening that draft. Changing an existing URL uses the separate
[URLs workspace](url-workspace.md), linked below the assigned path in the page editor.

The table is the project's explicit convention, not a claim of compliance with
a particular transliteration standard. Uppercase letters use the same mappings.

| Russian | Latin | Russian | Latin | Russian | Latin |
| --- | --- | --- | --- | --- | --- |
| а | a | б | b | в | v |
| г | g | д | d | е | e |
| ё | yo | ж | zh | з | z |
| и | i | й | y | к | k |
| л | l | м | m | н | n |
| о | o | п | p | р | r |
| с | s | т | t | у | u |
| ф | f | х | kh | ц | ts |
| ч | ch | ш | sh | щ | shch |
| ъ | omitted | ы | y | ь | omitted |
| э | e | ю | yu | я | ya |

## Creation-time page keys

New forms suggest index for the home URL /. Other usable paths suggest a
PascalCase key from the last segment, using the same transliteration as slugs:
 /games/seksualnost-energiya-zhizni/ suggests SeksualnostEnergiyaZhizni.
Dots become word separators; a leading digit gains the Page prefix. An incomplete
parent/root prefix, unsupported segment, malformed percent encoding or a key
already present in the current site uses Page followed by eight hexadecimal
characters. This stable random fallback is retained in the unsaved editor buffer.
Key suggestions follow the path only until manual key input. Existing saved keys
remain immutable. The repository remains authoritative for case-insensitive uniqueness within the
site and concurrent conflicts under [ADR 0050](../adr/0050-site-scoped-page-keys.md);
frontend suggestions do not reserve a key.

## Editable fields and API

The authenticated page creation/update REST requests accept h1, metaTitle,
metaDescription, robotsIndex, ogTitle, ogDescription, ogImage and ogType alongside
the existing title/content fields. GET and mutation results return those fields.
List projections remain summaries; the editor loads page details before editing.
Metadata strings are nullable; omission preserves a field on update and null
clears it. The editor sends null when a text field is cleared. robotsIndex is a
boolean; ogType is null, website or article. Invalid values return validation
errors and cannot write a partial page update. Ownership/actor/publication fields
remain rejected at the HTTP boundary.

OG image values must be absolute HTTP(S) URLs without embedded credentials.
They reference a publicly accessible image; this input does not upload a file or
publish private media. All metadata travels with the complete page publication
snapshot and is restored with the rest of the selected retained version.

## Administration layout (0.12.0)

Under [ADR 0076](../adr/0076-page-metadata-tabs-and-og-library.md), HTML editors
separate Main, SEO and Open Graph while preserving a conditional TV tab. H1
remains beside the page title on Main. Hidden panels remain part of draft saves.
Related fields share desktop rows; descriptions stay full width.

Open Graph uses the shared image-library picker. It selects the largest public
image output and resolves relative paths using the configured public site origin.
Existing absolute URL values are preserved until explicitly replaced or removed.
A single clickable media-file control displays the filename and optional thumbnail,
with an inline clear action. It opens the library without a separate chooser row.
Below it, size chips choose one actual public output; the chosen URL is saved.
New selections default to the largest prepared size at most 1200 pixels wide,
or the smallest available sized output when all are larger. Existing selections
retain their exact size. TV Single uses these same chips; Responsive keeps the
logical image without an individual size selection. The picker does not use the administration origin or private preview URL.
Uploading/selecting changes the draft; saving/publishing remain separate.

## Template fields

Raw values are available as `[[*h1]]`, `[[*metaTitle]]`,
`[[*metaDescription]]`, `[[*robotsIndex]]`, `[[*ogTitle]]`,
`[[*ogDescription]]`, `[[*ogImage]]` and `[[*ogType]]`.

The prepared `[[*seo.FIELD]]` view supplies:

| Field | Rendering value |
| --- | --- |
| title | Nonempty metaTitle, otherwise title |
| heading | Nonempty h1, otherwise title |
| description | metaDescription or empty text |
| robots | index,follow or noindex,follow from robotsIndex |
| ogTitle | Nonempty ogTitle, otherwise SEO title |
| ogDescription | Nonempty ogDescription, otherwise metaDescription |
| ogImage | ogImage or empty text |
| ogType | ogType or website |
| hasDescription, hasOgDescription, hasOgImage | Boolean conditions for optional metadata chunks |

ZaryaBasic emits these values in its head and heading, with conditional chunks
for optional descriptions/image. Custom templates must reference these fields
explicitly. No metadata is injected into arbitrary templates automatically.
Static and Request rendering use the same projection; active releases do not
change until republished. Existing frozen templates remain unchanged.
