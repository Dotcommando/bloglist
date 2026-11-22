# Page editor access behavior

A user can open the draft editor by direct link with `cms.pages.read` on that
page. Saving from the editor additionally requires `cms.pages.update` on it.
`cms.pages.list` enables the tree independently. A link opened without the read
grant explains which permission is required without disclosing the draft.

The role editor shows a hint next to Update a draft page when an update grant
is checked and no read scope is checked. Checking any read scope clears the
hint. Role grants remain explicit.

A successful draft update returns HTTP 200 and `{ "saved": true }` when the
actor lacks read access to the updated page. Readers receive the saved draft.
Existing update scope, validation and failure responses apply to both outcomes.
If read access is revoked while the editor is open, an acknowledged save
shows confirmation and closes the draft fields.
