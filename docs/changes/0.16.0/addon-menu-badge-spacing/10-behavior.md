# Behavior

The site menu starts immediately below the administration header. A positive
add-on count fits in the upper corner of its own menu item. Horizontal scrolling
can reveal the entire count on narrow screens. The count describes the button
for assistive technology, and the add-on label remains its accessible name.

The badge occupies its own space alongside the label inside the button. The
horizontal scroll container keeps its original top edge.

In Chromium, the focused browser test measured a 5 px gap with the previous
code at both 390 and 1200 px. After rebuilding, both viewport cases and the
adjacent add-on card test passed. Svelte typechecking and focused lint passed.
The Events badge in the separate test installation also fits at 390 and 1200 px
after rebuilding its administration assets.
See the [defect record](../../../defects/addons/menu-badge-spacing.md).
