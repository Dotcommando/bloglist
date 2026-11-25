# Administration interaction conventions

Keep feature workspaces with their supporting components, clients and models.
Place genuinely reusable controls under `shared/ui`. Put interface messages
in the owning [locale dictionaries](../../docs/arch/admin-frontend.md#interface-languages).
The [source layout](../../docs/arch/admin-frontend.md#administration-source-layout)
defines the directory boundaries.

## Workspace headings and actions

Reuse the shared _workspace-toolbar, _workspace-title/_workspace-location and
_workspace-scroll styles. Align the heading and content using the same horizontal
gutter; place actions on the right with that gutter, preserving usable wrapping on
narrow screens. Use the common primary/secondary button sizes for workspace actions,
including whole-site publication. Reuse RefreshButton.svelte for refresh actions.
Keep scroll panes full width; constrain long forms inside the pane instead.
Temporary views such as a journal must provide an explicit return to the selection.
Put the current view's single primary heading in _workspace-title inside the
workspace toolbar. Do not repeat it as a breadcrumb or another h1 in the content.

Show the shared saving spinner and a localized operation label while a request
blocks the user's controls. Keep feedback on the smallest affected surface.
Leave its content mounted so a pending operation preserves the layout.
For in-place data updates, follow the [results overlay standard](../../docs/cms-development/feature-design.md#loading-over-existing-data).

## Section submenus

When an item in the main site menu has subitems, display those subitems in a
second menu row immediately below .site-sections, above the workspace heading.
Keep .cms-tabs inside .site-viewport; place it before _workspace-toolbar in the
workspace so visual, reading and keyboard order agree.

Use nav.cms-tabs for section submenus, including add-on views. Both menu rows
share --cms-navigation-gutter; the first item's text must align across rows at
every breakpoint. Keep the submenu background and bottom divider full width;
apply the gutter as container padding, never as an outer margin or inset surface.
Use the shared cms-tab item padding and keep the active underline on its button.
The CMS owns the navigation gutter; add-ons must not override it with local
padding. Drawer tabs are separate controls and retain their compact layout.

## Reuse administration controls

When creating or changing administration interfaces, reuse existing Svelte
controls and the shared administration styles before introducing a new control.
Use the established themed input/select styles, cms-primary/cms-secondary/
cms-danger button variants and cms-action-square row actions. Reuse common icons,
focus, hover and disabled states; never leave new buttons with browser-default
appearance or recreate the theme in feature-specific CSS. A control needing
custom behavior, such as fractional input with whole-unit stepping, still uses
the shared themed controls. Keep local CSS for layout, alignment and sizing.
Action targets must be at least 44px.

## Form layout and visual grouping

Separate logical groups primarily with whitespace. A subtle background tint is
the second choice; borders around groups are the last resort and need a clear
purpose. Do not frame an entire editing area or use default fieldset borders.
This does not remove borders that identify input controls or selected rows.
Use two columns from tablet width (768px) when related fields fit comfortably,
and one column below it. Pair only fields belonging to the same semantic group. Keep
country calling code beside its phone number; do not pair it with an unrelated
language selector. Keep labels adjacent to their controls and preserve reading
and keyboard order.

Reuse Checkbox.svelte for styled checkboxes. Keep the compact control directly
beside its caption in one clickable label; never distribute them across the
available row width. Clicking the caption must toggle the checkbox. Preserve
native keyboard operation, visible focus, checked and disabled states, and a
usable touch target.

## Tables and row actions

Use the shared tables.css and cms-table/cms-table-wrap classes for future CMS
tables. Keep semantic table headings and cells, a muted header, generous cell
spacing, subtle row dividers and rounded outer corners. Hover and focus within
a row highlight every cell using --cms-table-hover. A current-account row uses
--cms-table-current and an explicit localized You badge; its color differs from
hover. Do not use color as the only indication of account state or identity.

Use 44px cms-action-square icon buttons with accessible action/account names and
tooltips. Put destructive deletion in the last column with cms-danger and a
trash icon. Blocking uses cms-warning and a prohibition icon; unblocking uses
cms-primary and an open-lock icon. Confirm these actions in CmsDialog, naming
the affected email and providing explicit confirmation and cancellation.
Password dialogs use one new-password field with the shared PasswordInput eye
toggle. Never persist passwords in browser storage or retain them after closing.

For compact entity tables, opt into cms-table__responsive: below 768px each row
becomes a card, primary identity spans the card, metadata retains visible labels,
and action buttons stay together. Keep explicit table/row/cell roles when CSS
changes their display. Use cms-table-meta__wide for wider metadata. Preserve
reading order and keyboard access; do not hide actions or require hover on touch.
Wider comparison tables may retain horizontal scrolling instead of cards.

## Left drawers

Use Pages as the visual and interaction reference for every left drawer,
including Templates, Chunks, Snippets, TV fields, Hooks, Files and URLs. Reuse
the shared page-drawer surface, drawer heading, scroll pane and row styles.
Keep the same background throughout the heading and list, desktop drawer width,
row spacing, hover, selection and focus treatment. The drawer must remain
visually distinct from the editing workspace over its full height.

All desktop drawers use --cms-drawer-width (286px) from 992px onward, including
flex and grid workspaces. Contents, active tabs and selection must never resize
that column. Below that breakpoint drawers use the available viewport width.
Use cms-drawer-label for single-line entity names with ellipsis; reserve space
for icons and metadata so they remain visible. Retain the full accessible name
and provide the full label in a title tooltip.

JSON-LD rows and preset creation buttons share JsonLdTypeIcon at the trailing
edge. Derive a profile's icon from its main entity, falling back to its node type;
custom Schema.org types use the generic icon with their exact type in the tooltip.
Do not append the type to the truncating visible label. Include it in the row's
accessible name and tooltip instead.

Keep the site domain in the shared _drawer-context row at the same position
across sections. Place the section heading below it in _drawer-title-row; do
not put that heading beside the domain. Reuse the mobile workspace toggle in
the context row so its height matches the Pages drawer at every breakpoint.

Render hierarchical data as a tree with consistent child indentation. For
expandable rows, visually separate the disclosure icon and its click/tap area
from the main selection area, following the tree rules below. Keep the heading
and actions fixed while the list scrolls. When an overflowing list is scrolled
away from its top, show the shared shadow beneath that fixed region; clear it
at the top or when the list no longer overflows.

## Fixed regions above scroll panes

Every fixed header or action region immediately above an independently scrolling
pane casts a shadow whenever that pane's scrollTop is greater than zero, including
a one-pixel or fractional scroll. At the top it has no shadow. Use the shared
scrollShadow action and shared CSS for drawer headers, editor/action bars and
other equivalent boundaries. Keep the state local to each pane, update it after
resize/reset, and remove it when the pane is destroyed. A different pane's scroll
must not turn the shadow on. The shadow must not move or resize the fixed region.

## Trees and selectable lists

Every selectable entity row has a visible background covering its click/tap
area by default. This includes Pages, Files, Templates, Chunks, Snippets, URLs,
real/virtual folders and folder roots. Hover darkens the background slightly.
Selection adds a visible border, using the existing Pages appearance. Reserve
border space so selection does not change row geometry. Keep visible keyboard
focus and accessible selection state as well; color alone is insufficient.
Indent every level of children, including children of root folders, so files
and folders visibly belong to their parent.

Selecting an item in any hierarchy must preserve that hierarchy's scroll
position and expanded folders, during loading, after success/failure and when
returning from the editor on mobile. Apply this to Pages, URLs, Files and the
Templates/Chunks/Snippets lists. Keep loaded tree/list content mounted; load the
selected item's details separately. Loading indicators must not displace rows
or collapse the list. Keep each site's hierarchy state isolated; switching sites
must not restore another site's scroll. Keyboard navigation may scroll only as
needed to reveal the focused item. Editor scrolling is independent.

Folders have a visually separate disclosure area, with a divider and distinct
background. Clicking/tapping that area only expands/collapses children; it must
not select the folder or navigate. Clicking/tapping the remaining row only
selects/opens the folder's editor or contents; it must not toggle disclosure.
Keep both areas usable on touch screens. Preserve keyboard expansion/collapse
(native disclosure buttons or the Pages tree's ArrowLeft/ArrowRight controls),
and expose expansion state and meaningful labels. Do not nest buttons.

Selecting a folder in any hierarchy opens a useful contents overview in its
workspace, including folder roots and page/URL nodes with children. Show clearly
scoped child counts, meaningful names and relevant details (page URL/public
availability, file type/size, redirect destination), with actions to open the
children. Keep it current after changes. Show an explicit empty state; raw counts
alone are insufficient. Retain the selected entity's editing controls.

Reuse shared styles/behavior rather than inventing per-capability variants.

## Add-on workspaces

Follow [the maintained add-on layout contract](../../docs/arch/admin-frontend.md#add-on-workspace-layout).

## Inline text actions

Follow [the maintained text-action contract](../../docs/arch/admin-frontend.md#inline-text-actions).
Keep real navigation links as hyperlinks.
