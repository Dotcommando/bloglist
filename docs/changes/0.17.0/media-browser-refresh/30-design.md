# Design

Use the shared spinner and overlay styles in a reusable core overlay. Scope the
tint and busy state to results. Bound the center to the intersection of results
and their clipping scrollports. Clean up scroll and resize observers when the
overlay is removed. Keep filters outside the overlay. Use CMS compact toolbar
classes and retain 44px targets on coarse pointers.

This changes presentation of existing authenticated reads. The HTTP endpoint,
admission, data, archive formats and dependencies retain their contracts.
