# Existing page access

The workspace gates single-page loading by `cms.pages.read`, tree loading by
`cms.pages.list` and the save action by `cms.pages.update`. The dispatcher
resolves each endpoint's own site and object grant. The update response currently
serializes the saved page without applying the independent read scope.

The [Pages](../../../defects/pages/README.md) and
[Administration](../../../defects/admin/README.md) indexes were checked. Existing
records on position changes, save error translation and publication recovery
cover separate mechanisms from this response projection and role guidance.
