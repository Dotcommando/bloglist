# Page editor access cases

| ID | Result | Boundary |
| --- | --- | --- |
| PAGE-ACCESS-01 | An update-only request persists a valid change and returns only `{ "saved": true }`. A caller with the read grant for that page receives the saved draft. | Adapter and real HTTP |
| PAGE-ACCESS-02 | A read grant scoped to other objects confers no response data. An owning or group-matching grant can read the saved state. A denied update cannot write. | Adapter and real HTTP |
| PAGE-ACCESS-03 | Sign in with all three page actions, open a direct link, edit, save, and reload. With read and update but no list, the same direct flow works without loading the tree. With read alone, the draft opens without save controls. | Playwright and isolated MongoDB |
| PAGE-ACCESS-04 | Sign in without read, visit the direct link, see the access message, and fail to load the draft over HTTP. An authorized update returns only its receipt. | Playwright and isolated MongoDB |
| PAGE-ACCESS-05 | The hint appears only for a role with update and no read, and reacts to the read checkbox. | Playwright and isolated MongoDB |
| PAGE-ACCESS-06 | If read is revoked during an open editor session, the client recognizes the saved draft receipt, shows confirmation, and closes the draft fields. | Playwright and isolated MongoDB |
