# Page editor access design

Resolve the read grant from the authenticated session using the same endpoint
resolution as an ordinary page GET. Scope `all` covers the granted site. Check
`own` and `groups` through the existing scoped page lookup so the storage
attributes stay outside the draft snapshot. The reply uses the result captured
by the update. A missing, unmatched or failed read check after a successful
write produces the receipt. The authorization transaction governs the write.

The role hint follows the displayed role's unsaved scopes. The direct-link
view uses the current site's read grant for its access message. The catalog
and server remain authoritative for actions and object scope.
The client accepts the receipt if read access was lost while editing. It
reports the successful draft write and closes the editor.
