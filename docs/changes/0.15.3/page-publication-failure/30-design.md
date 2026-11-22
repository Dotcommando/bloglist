# Design

Reuse the existing strict favicon recognizer in the two owning release builders.
Keep the validated favicon URL intact; continue rebasing and checking CSS/JS
against the selected release's declared public artifacts. Do not broadly allow
root/external links, forged favicon markers, private files or foreign releases.
No schema, port, dependency, runtime compatibility or publication-authority change.
Align session publication's optional favicon-store dependency with local
publication. A real HTTP regression confirmed the omission separately.

Reconcile publication options after a failed editor publication without repeating
the write. Preserve draft text and the actual failure. Refresh URL/publication
state independently; do not equate PUBLISHED page-version state with activation.
The routing-revision effect uses the page captured at mount and cannot refresh a
newly created page. Explicitly reread options by the acknowledged saved page ID in
the failure handler. Preserve the original feedback; read failure marks options
unknown, and 401 uses existing session-expiry handling. Never repeat the write.

Security scope: asset identity/classification and truthful mutation recovery.
Existing session/site authorization remains unchanged. Verify malformed/foreign
links still fail and do not add a resource-fetching or code-execution capability.
