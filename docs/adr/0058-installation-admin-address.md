# ADR 0058: Mutable installation administration address

Date: 2026-11-04

Status: Accepted through the owner's explicit CMS 0.10.0 request.

The administration address belongs to the backend installation, shared by all
sites. Store its origin, opaque version, previous origin and private verification
key in a global singleton. Seed it from ZARYA_ADMIN_AUTH_ORIGIN only when absent;
subsequent environment changes do not override the database. Preserve the fixed
/admin/ path. Public site origins and Worker backendOrigin remain independent.

GetInstallationSettings accepts an authenticated administration session and
returns adminOrigin, previousOrigin and version. ChangeAdminAddress accepts that
session, adminAddress and expectedVersion, returning the committed settings.
Existing active administrators have installation authority, matching the current
global administration model. Expose GET/POST /api/admin/installation/settings.
The administration form lives in Settings > General ("Настройки" > "Общие"),
with an explicit installation-wide scope notice; it is not a header action.
Authenticate before reading bodies. Reject unknown fields and limit JSON to 8 KiB.

Changes require a public DNS hostname, HTTPS on its standard port and /admin or
/admin/. Reject credentials, query, fragment, IP literals and local/reserved
names. Verify the actual administration shell with a fresh challenge and an
installation-keyed HMAC bound to the candidate host. Require valid TLS, a direct
200 HTML response and the correct proof. Never follow redirects, send cookies or
credentials, or probe private/non-global resolved addresses. Bound verification
to 10 seconds. Probes do not grant administrative API access.

Validation or reachability failure returns Validation (400); invalid sessions
return AuthenticationRequired (401); concurrent edits return StaleWrite (409).
No failed validation/probe writes settings. Recheck authentication after probing;
compare the captured settings version atomically at commit. An unchanged address
is a no-op. Read committed settings for each new administrative request and use
one request-scoped origin consistently for every controller, CSRF check and cookie.
Requests already admitted finish with their captured origin. Database failure
fails closed. There is no per-process mutable origin cache or restart requirement.

After commit, APIs reject the former host. GET/HEAD navigation from the immediately
previous administration host redirects to the current origin, preserving safe
reserved admin paths and queries; other foreign hosts remain forbidden. The UI
navigates to the new /admin/ after save and explains that login may be required.
Cookies remain host-only and are never forwarded between origins. Bind cookie
values to the captured installation settings version, invalidating old cookies
on each address change and requiring sign-in for legacy unversioned cookies.
Deployment
diagnostics and container health use /api/health, independently of the admin host.

Keep installation settings and their verification key outside site dumps. Add a
new checksum-verified migration; do not change applied migration manifests.
Verify fake-port use cases, adapter boundaries, composition and an isolated
MongoDB/HTTP workflow, including restart, stale writes and rejected old hosts.
