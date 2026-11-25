# Evidence

- RED on `99ef34e`. Chrome measured the folder label at 16px where 14px
  is required, and the existing end-truncation markup did not reserve an
  extension.
- GREEN in `fits Files labels on one line without hiding the file extension`
  using the production admin build and an isolated MongoDB 8.0.29. Chrome
  measured 14px at 1440px and 768px and 13px at 390px. The browser verified the
  complete accessible name, title and measured fit for four long labels with
  ordinary, repeated dots and combined Unicode graphemes. A short name stayed
  intact. The historical two-dot fixture was supplied at the read boundary.
- The Files navigation and upload scenario and the paged 100,000-file Chrome
  scenario passed on the same production code.
- Production admin build, TypeScript, Svelte, affected ESLint and whitespace
  checks passed.

One bug was confirmed and fixed. One new
[defect card](../../../defects/admin/file-label-extension-hidden.md) records
the correction. No vulnerabilities were confirmed in this scope.
