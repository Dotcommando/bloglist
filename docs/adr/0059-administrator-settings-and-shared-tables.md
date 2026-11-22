# ADR 0059: Administrator settings and shared administration tables

Date: 2026-11-05

Status: Accepted by the owner's request for administrator management in Settings.

## Decision

Add Settings / Admins to manage installation-global administrator accounts.
Every active administrator continues to manage every site. Do not introduce
roles, permissions or site assignments. This supersedes ADR 0011's console-only
creation and local-only management entry restrictions; its account invariants,
password policy, soft deletion, concurrency and last-administrator protection
remain unchanged. The interactive console remains available for first setup.

Generalize the existing creation operation as CreateAdminUser; retain the private
console port/class names as compatibility exports of that same implementation.
Authenticated HTTP composition binds creation and existing listing/password,
block/unblock and delete operations to the cookie's current actor. No local
operator is available through this network boundary. Reject self-blocking in
the application operation as well as disabling its UI button.

The protected REST capability is /api/admin/users. GET retains keyset pagination
and adds currentAdminUserId for the You indication. POST creates from email and
password. POST /:id/password, /:id/block and /:id/delete require expectedVersion.
The actor always comes from the session; callers cannot send actorId, site scope,
roles or assignments. Authenticate before reading the bounded JSON body and keep
same-origin/custom-header/no-store protections. Bound concurrent password work.
Never expose password digests. Account-version changes keep the existing session
invalidation policy. Changing one's own password or deleting one's own account
clears the cookie and returns currentSessionInvalidated so the UI shows sign-in.
Deletion of the last active account remains forbidden; self-deletion otherwise
uses the same explicit email confirmation as other deletions.

## Interface

Use one current-view heading beneath the second navigation row. Display email,
status and creation time with three square icon actions: password, access and
last-column deletion. Deletion uses danger/trash; blocking warning/prohibition;
unblocking primary/open lock. Confirm block, unblock and delete in an accessible
native modal dialog naming the email. Password entry has one new-password field
and an eye toggle; allow changes to self and other accounts. Clear secret input
on closing or success and never persist it in browser storage.

Use the shared tables.css for future CMS tables. The current account has a
distinct background, accent edge and localized You badge. Hover and focus within
highlight the entire row using a different color. Buttons retain visible focus,
accessible names, state and 44px targets. Below 768px, compact entity tables can
display each semantic row as a labeled card with all actions visible. Preserve
table roles and keyboard order. Wide comparison tables may scroll horizontally.
Record these conventions in admin/src/AGENTS.md.

Tests cover application self-blocking, safe session-bound REST translation and
composition, rejection before body reads, real isolated persistence/session
behavior and responsive browser interactions with synthetic data.
