# Cloudflare delivery

[Installation](INSTALLATION.md) · [Русский](../ru/cloudflare.md)

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in private `.env`.
Use a token scoped to the intended account/zone with the Worker script/static
asset deployment and Custom Domain/route permissions required by Wrangler.
The executor also reads Worker deployments and account Worker domains to confirm
delivery. Permit the executor's outgoing IP addresses if the token has a client
IP filter. The HTTP process does not receive provider credentials.

Copy `cloudflare.example.json` to private `cloudflare.json`. Set the published
site ID, stable Worker name, selected public origin and reachable backend origin.
Use the same random `ZARYA_EDGE_PROXY_SECRET` for backend and executor. The
executor uploads it as a Worker secret through a temporary private file.

```sh
docker compose run --rm --no-deps cloudflare node /app/dist/deployment.js configure
docker compose --profile cloudflare up -d cloudflare
docker compose run --rm --no-deps cloudflare node /app/dist/deployment.js status
```

Starting the HTTP application does not create a Worker. The first executor upload
creates it after the site has an active publication and an enabled delivery target.
Nonempty Cloudflare credentials with the required permissions are necessary;
a DNS record alone does not initiate delivery.

Configuration queues the current publication. Later committed activations,
including routing-only releases, are observed automatically. Saving drafts does
not request an upload. Each target has one durable attempt; newer publications
remain pending until it completes. A restart preserves the saved delivery state.

Administrators can also configure the target in **Settings / Deployment** for
the selected site. Use the selected site public origin and a distinct reachable
backend origin. This tab shows the active CMS release separately from the last
confirmed external delivery, attempts, safe diagnostics and guarded retry.
Its Check action verifies publication storage and backend connectivity; provider
credentials and domain ownership are checked by the executor. Credentials remain
in its private environment. Refresh reads the saved status without uploading.

`Succeeded` requires an active provider version, the correct Custom Domain and
a public response carrying the exact attempt/publication receipt. Preparation or
an unsuccessful/uncertain Wrangler exit cannot acknowledge public delivery.
`Failed` contains a safe diagnostic; correct the cause before an explicit retry:

```sh
docker compose run --rm --no-deps cloudflare node /app/dist/deployment.js retry
```

`OutcomeUnknown` blocks another upload. Reconciliation checks the provider and
public receipt without uploading again. Do not clear it or remove filesystem
locks while an old uploader may still run. If the result cannot be established,
inspect provider history and resolve the interrupted operation before proceeding.

For an explicit preparation-only check, or manual maintenance delivery, use:

```sh
docker compose stop cloudflare
docker compose run --rm --no-deps cloudflare node /app/dist/prepare-cloudflare.js --deploy --dry-run
```

Omitting `--dry-run` uploads manually. Stop automatic delivery first, finish all
in-flight work, and inspect the resulting public state before restarting it.
Keep the private executor workspace out of static hosting and backups published
to the web. Only generated `deploy/public/` contains publishable files.
