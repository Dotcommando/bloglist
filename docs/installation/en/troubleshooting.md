# Troubleshooting

[Installation](INSTALLATION.md) · [Русский](../ru/troubleshooting.md)

Start with `docker compose ps`, `docker compose logs --tail 100 app`,
`docker compose logs --tail 100 proxy`, and
`docker compose logs --tail 100 cloudflare`. Never publish private environment
values or raw database/provider errors. Check saved delivery status with the
command in [Cloudflare delivery](cloudflare.md).

| Symptom | Check |
| --- | --- |
| Authentication/authorization diagnostic | Correct token/account, expiration, Worker/domain permissions and outgoing-IP filter; test from the executor host |
| Backend diagnostic | DNS, port 443, Caddy certificate and backend `/admin/` HEAD response |
| Domain conflict | Existing Worker attachment or ordinary public-host DNS record; never delete unrelated records |
| Storage diagnostic | Mounted source/artifact/media paths, permissions, active publication and file integrity |
| No publication | Publish the site; a draft save is insufficient |
| OutcomeUnknown | Finish/reconcile the old upload before retrying; retain provider history |
| CMS cannot start after upgrade | Apply and verify the new migration using the new image; preserve old receipts |
| Login origin rejection | Open the configured canonical administrative origin; verify proxy-loop and Host settings |

Verify public documents, media, CSS, live API responses and administration after
each migration/deployment. API/admin/Request responses must not be cached.
Checking locally prepared files or an exit code alone does not verify a live
deployment. Keep backups private and distinguish data restoration from provider
deployment rollback.
