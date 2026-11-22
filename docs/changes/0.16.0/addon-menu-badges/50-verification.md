# Verification

- Before the port, the focused administration REST test failed because the
  authorized add-on list lacked the declared capability. Denied access exposed
  no capability metadata.
- After the port, the adapter and site add-on module tests passed (3 tests).
- The full TypeScript and Svelte workspace checks and the admin build passed.
- Repository lint and the Git whitespace check passed.
- The site installation uses the separate reviewed 0.15.3 change. Neither the
  Inbox runtime itself nor any site content is part of this branch's port.
