# ADR 0026: Site Files and named public image URLs

Date: 2026-10-27

Status: Accepted through the owner's Files discussion.

Files is a site-scoped administration tab with a left folder tree and image
details. Administrators create folders, upload images, rename and move files,
replace image contents and delete files. Generated variants belong to one image;
they cannot be moved, renamed or deleted independently.

Each upload explicitly selects Original or Responsive. Original retains its
bytes and publishes a usable copy without resizing or transcoding. Responsive
uses ADR 0010's six proportional WebP profiles and quality 92. Each current image
retains its immutable private original until replacement or deletion. Actual
dimensions accompany every usable image.
SVG/ICO retain their format and have no generated raster variants.

Public library paths contain the site identity, folders and filename. Renaming
and moving changes the paths of all variants, without rewriting authored content
or adding redirects. Change image retains the library name and public paths,
regardless of the uploaded filename. New private immutable content is prepared
before updating the public projection. Named media is mutable and requires
revalidation, rather than immutable caching. Static hosting remains supported.

The UI copies img or picture markup. It emits actual width/height and only emits
srcset/source entries when variants exist. The layout's sizes value is explicit,
editable input; viewport profiles do not assert the image's layout width.

Usage details distinguish Content, Open Graph, and Templates/chunks, identify
the source field and link to its editor. They include retained publications as
well as drafts. Literal references can be discovered; dynamically constructed
script URLs require explicit dependencies and cannot be proven by text search.

Delete first returns current usages. A used image exposes Force delete only after
that result is displayed. Force delete has no additional confirmation dialog and
explicitly permits broken image references, including retained publications.
This supersedes the media-retention prohibition for this explicit owner action;
it does not change any page deletion or publication rule. File metadata versions
guard replacement and movement. Force delete adds no review token or server-side
usage checks; authentication and site ownership are still enforced.

The metadata catalog and named public files are separate persistence resources.
Catalog changes retain a durable pending projection until all named files have
been installed; errors remain visible and can be explicitly reconciled. No
distributed filesystem/MongoDB transaction or automatic image-processing retry
is claimed. Image preparation uses the existing bounded, single-attempt pipeline.
