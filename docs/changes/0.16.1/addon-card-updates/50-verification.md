# Verification

RED, AC-3: the focused application and HTTP spec run reproduced four failures. The existing handler returned 400 for a card key and the existing use case proceeded to activation without verifying the active key and digest.

GREEN, AC-3: the same application and HTTP files passed all 20 tests. The wider
focused unit run passed all 42 tests across repository linking, check/status
translation, GitHub App and delivery, and release consistency. The isolated
repository installation integration scenario ran the built administration in
Chromium, rejected a foreign key without a claim and then connected the identical
active package through the card. The same scenario verified ordinary installation
and retained connections before and after restart.

Source checks: lint, server typecheck, admin typecheck with zero warnings and
the native build passed. Vite reported its informational chunk-size warning.

AC-1 and AC-2: both compatible scenarios in
`addon-live-updates.integration.spec.ts` passed in Chromium with isolated MongoDB
and the prebuilt Synthetic fixtures. The repository case loses the response
after commit, reloads by saved identity, clears the completed identity and
displays only the active version. The file case checks and applies a package
from its card and verifies the global-scope notice at desktop and mobile widths.
The test reads the live upload response in Playwright before fulfilling it,
avoiding a Chromium inspector-cache eviction seen in the first run.

AC-4: the local 0.16.1 archive checksum and extracted inventory passed. The
restored installation built natively and in both Docker targets. Migrations,
published pages, media, the administration entry, retained add-on versions and
existing account count were verified. Both Docker targets passed service-user
import and release-identity checks, and the app image can read the read-only
GitHub App mount as UID 1000. Native GitHub App access was confirmed by
reading the latest releases of the configured private repositories.

Defect inventory: one confirmed admin bug, zero confirmed vulnerabilities.
[Completed update shown as a candidate](../../../defects/addons/completed-update-shown-as-candidate.md)
is fixed and has one canonical defect card.
