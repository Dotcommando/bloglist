# Behavior

The CMS version is a same-screen action: retain dotted underline, shared hover
and native keyboard semantics alongside outside/Escape dismissal. Publish a
version-consistent 0.15.2 source release only after release-workflow checks.
The tagged commit must be merged into master. Observe GitHub Actions and actual
release assets before reporting publication success. Update the local populated
site from that artifact, preserve data/runtime/configuration and unrelated edits,
commit the update separately. Do not deploy production or start persistent CMS.
