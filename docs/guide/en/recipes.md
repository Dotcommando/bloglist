# Recipes

[Guide](README.md) · [API reference](reference.md)

These server examples perform real writes. Use unique names/marks on an isolated
example site. They are not installers or seed content.

## Compose a chunk, template and TV

Run in a trusted add-on/application context with an ICmsApi client:

```typescript
const card = await cms.chunks.create({
  name: 'ApiCard',
  html: '<p>[[+text]]</p>',
  css: '',
  browserTypeScript: null,
  parameters: [{ name: 'text', kind: 'String', required: true }],
});
const template = await cms.templates.create({
  name: 'ApiTemplate',
  html: '<html><head><title>[[*title]]</title></head><body>[[$'
    + card.key + '? &text=`[[*lead]]`]]</body></html>',
  css: '',
  browserTypeScript: null,
  parameters: [],
});
const catalog = await cms.tvs.list({ limit: 256 });
const version = catalog.metadata?.version;
if (typeof version !== 'string') throw new Error('Missing TV version');
await cms.tvs.save({
  expectedVersion: version,
  fields: [...catalog.items, {
    name: 'lead', caption: 'Lead', description: '',
    kind: 'Text', templateIds: [template.key], required: false,
    sortOrder: 10, defaultValue: 'Welcome',
  }],
});
const page = await cms.pages.create({
  mark: 'ApiExample', language: 'en', title: 'Example',
});
await cms.pages.configureRendering({
  pageId: page.pageId,
  rendering: {
    templateId: template.key, delivery: 'Static', interaction: 'None',
    parameters: {}, loaders: [],
  },
});
const details = await cms.tvs.getPage({ pageId: page.pageId });
await cms.tvs.savePage({
  pageId: page.pageId, templateId: template.key,
  values: { ...details.values, lead: 'Hello from the API' },
  expectedUpdatedAt: details.updatedAt,
  catalogVersion: details.catalog.version,
  mediaVersion: details.mediaVersion,
});
await cms.pages.publishCurrent({
  pageId: page.pageId, templateId: template.key, path: '/api-example/',
});
```

The current TV definition contract permits at most 256 fields, so the example
reads the complete catalogue before replacing it. Do not save only the first
page of a paginated list. SavePage replaces page values under catalogue/media/
draft guards. The final explicit publication makes the document public.
TV absence, an explicit null and a declared default remain separate cases.

## Select content versions

```typescript
const draft = await cms.pages.getDraft({ pageId });
const active = await cms.pages.getPublished({ pageId });
const released = await cms.pages.getPublished({ pageId, releaseId });
const versions = await cms.pages.listVersions({ pageId });
const selected = versions.items[0];
const retained = selected
  ? await cms.pages.getPublished({ pageId, pageVersionId: selected.pageVersionId })
  : null;
```

The first list item is not promised to be the newest; default ordering is stable
identity ordering. Retained positions for restoreVersion remain a separate
existing contract. Separate calls are not one database snapshot; capture and
reuse a releaseId when the read group must refer to one release.

## Add an object API

See the [server extension example](../../addon-development/code-standards.md#server-extension-example)
for the code-owned descriptor and its registered call.

## Use hooks with API commands

CMS commands keep their existing checks and event emission. Subscribe a handler
through hooks.create, hooks.apply, hooks.setEnabled and hooks.subscribe using the
captured versions. An Event handler has its existing durable command-plan API;
a Check remains side-effect-free under the hook contract. This release does not
inject the new cms client into hook workers or generalize hook grants.
See [hooks contracts](../../arch/hooks.md) for delivery/retry/unknown-outcome rules.

## Update an installed add-on

For a GitHub-installed add-on, choose **Check for updates** on its card. When a
newer version is available, the card displays it and offers **Install update**.
To update from a file, select a prebuilt addon.runtime.gz and choose Check package.
Review the versions and whether the add-on pauses, then choose Update. This affects
all sites in the installation and requires a global administrator. The site keeps
serving; only the affected add-on pauses for incompatible migrations. After a
lost response, use Check status or Continue update with the saved identity.
Connections and business data are retained. See the [live update contract](../../arch/live-addon-updates.md).

In Settings / General, process rows show service/site PIDs and lifecycle states under a shared CMS CPU quota. In Calibration, select public API steps offered by each site’s enabled add-ons. Results retain the measured add-on composition; changed versions/configuration require another run. Rates describe visits (page plus API steps); request details show individual API errors and latencies.

The production resource helper shares the CMS network namespace so the external
calibration generator can reach its trusted loopback listener. The application
waits for the private helper socket before HTTP startup. Keep both services in
the same Compose operation; they retain separate processes and CPU accounting.
See the [real Docker verification](../../audits/0.15.0-docker-addon-calibration.md).
