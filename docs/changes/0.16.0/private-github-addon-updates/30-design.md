# Design

Use the anonymous GitHub release API for public packages. When the provider hides the release, check for a visible repository and resolve a private repository through the App's exact repository installation endpoint. Issue a token restricted to that repository with Contents read permission. Use the token for release, commit and initial asset requests to api.github.com. Keep redirect allowlisting and drop credentials before following downloads. Neither browser input nor a GitHub response supplies the secret directory or API base.

Read bounded PEM files directly from the configured installation directory when authenticating. Skip malformed PEMs and rotate past keys that GitHub rejects. Never serialize keys, JWTs, tokens or response bodies in CMS data or diagnostics. Existing administrator admission precedes private lookup. Provider failures preserve the existing staging disposal and retry contract.
