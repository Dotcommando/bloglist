# An interrupted site writer left an unrecoverable marker

- ID: `media/abandoned-site-writer-marker`.
- Kind: confirmed bug. Status: fixed in the 0.17.0 candidate.
- Discovered: 2026-11-25. Affected candidate: `df6e10e`. Earlier range unknown.
- Read for: process exit, media projection, relocation, local writer admission.

The shared lock used a file whose owner was written after creation. An exit
between those steps left an empty marker without a process identity. Concurrent
reapers could also act on a reused path belonging to a different lock owner.

Each contender now creates a unique marker with its PID in the name and
publishes its ticket separately. A contender can reclaim the exact marker of
a dead process and retry without touching the successor's lock.

The [writer process regression](../../../test/integration/media-writer-process.integration.spec.ts)
exits a real process after creating an empty marker, then checks that four
independent writers finish with exclusive access and reclaim the marker.
The owning contract is [Site Files](../../arch/site-files.md).
