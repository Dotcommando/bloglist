# Evidence

- RED on `838be12`: the held-refresh Chrome check timed out waiting for the
  scoped overlay. The original loading paragraph was still in use.
- GREEN with the candidate admin build and isolated MongoDB 8.0.29. Both
  `opens Files in Chrome at 100,000 files without requesting the complete
  catalogue` and `shows the built Files UI, both upload modes, copied HTML and
  Force delete without a dialog` passed. The first check verified unchanged
  row bounds, an available search field, the busy state, the center before
  and after scrolling, and retry after a failed request. It also verified
  the compact toolbar geometry and the existing page-size preference. The
  second check included the 390px layout, both view controls and file actions.
- TypeScript, Svelte, affected ESLint, the production admin build and
  whitespace checks passed.

One bug was confirmed and fixed. One card was created,
[admin/media-browser-refresh-shift](../../../defects/admin/media-browser-refresh-shift.md).
The focused browser checks found zero vulnerabilities.
