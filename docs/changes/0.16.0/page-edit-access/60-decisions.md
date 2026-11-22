# Page editor access decision

The owner approved this behavior for 0.16.0. The
[interface decisions](../rbac-abac/interface-access-resolutions.md) describe the
role and editor behavior. A successful write without read access returns the
minimal JSON receipt `{ "saved": true }`.
