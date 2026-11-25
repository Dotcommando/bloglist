# Evidence

- RED on `e5b7694`. The Chrome check could not find a region named Site archive.
- GREEN in `shows category dump choices only to a system administrator` using
  the production admin build and an isolated MongoDB 8.0.29. Both roles saw
  the named site group with Export and Import. The system administrator saw
  the installation heading above it with the same style. Category choices and
  the existing site administrator restriction passed.
- Production build, TypeScript, Svelte, affected ESLint and whitespace checks
  passed.

One bug was confirmed and fixed, with one new
[defect card](../../../defects/admin/site-dump-group-heading.md). No
vulnerabilities were confirmed in this scope.
