# Domains and TLS

[Installation](INSTALLATION.md) · [Русский](../ru/tls.md)

The backend hostname points to the server's IP. Caddy listens on 80/443 and
automatically obtains and renews its public certificate. Persist its `caddy-data`
and `caddy-config` volumes. Keep DNS and ACME validation reachable; verify Caddy
logs and direct HTTPS before attempting a Worker upload.

The canonical public hostname is a Worker Custom Domain; Cloudflare creates its
DNS record and browser-facing certificate. An ordinary A/CNAME record on that
hostname can block attachment even after a code upload. Resolve only the known
conflicting record after recording its previous value. Keep backend DNS separate.

For a canonical `https://www.example.test`, verify all four combinations:

| Request | Result |
| --- | --- |
| `https://www.example.test/path?q=1` | Canonical document |
| `http://www.example.test/path?q=1` | Permanent HTTPS redirect |
| `https://example.test/path?q=1` | Permanent redirect to canonical www |
| `http://example.test/path?q=1` | Permanent redirect to canonical HTTPS www |

Configure the apex redirect separately in Cloudflare with a proxied DNS record;
preserve path and query. For an apex canonical site, reverse the www/apex roles.
The Worker matches its configured hostname exactly and cannot handle another
hostname merely because it exists in the same zone.

When backend DNS is proxied, use Full (strict) with a valid backend certificate.
Avoid rules that redirect the backend hostname back to the public Worker.
Outside localhost both configured origins require HTTPS and must differ.

`ZARYA_ADMIN_AUTH_ORIGIN` supplies only the initial admin origin,
seeded into the database at first startup. Later use Settings > General to
change "Administration address", for example to
`https://www.example.test/admin/`. This setting applies to every site. Editing
the environment does not overwrite the saved address.

Configure HTTPS and proxy `/admin/*` and `/api/admin/*` to this installation first.
The CMS Worker already proxies these paths. CMS verifies the hostname, TLS and
its own administration response through the candidate address; failure preserves
the previous setting. Saving switches the address without restarting, invalidates
the old cookie and opens the new administration for sign-in. The previous admin
address redirects to the new one; its API host is rejected. "Backend origin" in
Deployment remains the Worker's connection to the backend; keep backend DNS.
Host rewriting and Worker headers grant no administration privileges.
See [ADR 0058](../../adr/0058-installation-admin-address.md).

References: [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).
