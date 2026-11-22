# ADR 0002: S3-compatible media storage and upload-time image variants

Date: 2026-10-24

Status: Accepted by the owner.

Amendment: ADR 0010 supersedes the mandatory S3 adapter, absolute derivative
widths and automatic processing-recovery policy with the owner's explicit local
filesystem, proportional WebP and single-attempt processing decisions.

## Context

Zarya needs a portable media library for content sites and small service landings.
Published pages should remain static where possible and reserve image space before
images load, preserving the project's Cumulative Layout Shift (CLS) goals. The
owner selected an S3-compatible adapter and image variants for every CSS breakpoint.

## Decision

- The CMS owns media metadata, validation, permissions, processing and lifecycle.
  Store metadata in MongoDB and binary objects through an S3-compatible outbound
  adapter. Keep SDK/provider details out of domain, application and port contracts.
- Do not bundle MinIO as a mandatory CMS component. The concrete storage provider
  and endpoint are explicit deployment configuration; no implicit local fallback.
- Reference media by stable asset identifiers and immutable versions. Separate
  private originals from public derivatives and private documents.
- Generate required raster variants during the upload workflow through a Sharp
  adapter. Mark an asset version ready only after processing and metadata succeed.
- Cover viewport breakpoints 576, 768, 992 and 1200px, plus the 320px baseline
  and 1440px cap. Default 1x target widths match those values. Share one versioned
  profile configuration between processing and rendering.
- Normalize orientation, preserve aspect ratio unless an explicit crop is defined,
  and avoid upscaling. Record coverage when several profiles share a derivative.
- Persist actual width, height and aspect ratio for the normalized original and
  each derivative, alongside format, byte size, version, checksum and profile map.
- Emit initial image geometry through HTML width/height and structural CSS.
  Generate srcset from actual variant widths and sizes from the component layout,
  rather than assuming viewport width equals rendered image width.
- Public media has stable immutable S3/CDN URLs and remains accessible without
  NestJS. Explicit self-contained exports may copy public referenced derivatives.
  Expiring private delivery URLs do not belong in public static pages.

## Consequences

Uploads require processing time and space for originals and responsive variants.
Durable states and idempotent recovery must handle partial binary/metadata writes.
Small source images may reuse one derivative across multiple breakpoint profiles.
Image replacement and cleanup must preserve active publications and rollback.
Backups/restores cover both MongoDB metadata and binary storage.

This decision records required behavior. It does not scaffold the CMS, provision
a bucket, choose a storage vendor or implement upload/image-processing workflows.
