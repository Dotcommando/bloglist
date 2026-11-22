# Decisions

Owner explicitly authorizes merge/release publication and local update commit;
production is explicitly excluded. Master is the actual primary branch, as the
owner requested. Preserve existing tags and histories; never move a published
tag or use force push. Reuse existing text-action and Popover behavior. Existing
owner site edits remain outside the installation commit. Initial host checks are
preflight evidence; actual hosted release success must still be observed.

Hosted success and downloaded assets are now verified. The local site update
commit deliberately excludes the six cookie-notice owner files and is not pushed:
the owner requested its local commit and explicitly excluded production updates.
Post-publication documentation closure does not move the immutable tag or rebuild
the published source asset. Retain that distinction in installed provenance.
