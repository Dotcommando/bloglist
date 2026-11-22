# Getting started

[Guide](README.md) · [Concepts](concepts.md) · [Reference](reference.md)

In an edited Snippet, cms is available as a local variable and as context.cms.
No import is needed or permitted inside the edited function body. For a Snippet
with no parameters and a required String result contract:

```typescript
const page = await cms.pages.getDraft({ pageId: context.pageId });
return page?.title ?? '';
```

Name the Snippet DraftTitle and bind its result in a template or chunk:

```html
[[DraftTitle? &as=`title`]]
<h1>[[+title]]</h1>
```

Use [[!DraftTitle? &as=`title`]] for Request execution and declare Request delivery
when the document depends on Request values. The placeholder is escaped.
Publish the page and activate its release through the normal publication flow.
A draft save alone does not publish a document.

For public content from another page, prefer getPublished. getDraft deliberately
reads editable content; returning it into public markup is an explicit disclosure
by the trusted author. On first publication getPublished may return null because
there is no active release yet.

A registered native Snippet receives the same client as context.cms. Its registration,
typed inputs/output and supported phases remain explicit.

A packaged add-on receives host.cms, scoped to its own addonKey:

```typescript
const cms = await host.cms.forSite(trustedSiteId);
const page = await cms.pages.getDraft({ pageId });
await cms.pages.update({ pageId, title: 'Updated title' });
```

Obtain trustedSiteId from the host's validated site resolution or authenticated
administrative context. Do not forward unchecked request identities.
The host checks the add-on connection on every operation, including after a
client has been obtained. The default access class requires Enabled.
AdministrationRetained is available explicitly for retained maintenance.

Use fixed-version package artifacts and their lockfile integrity.
The synthetic test add-on is a separate project and must be installed only into
isolated test environments; it is not a dependency or registration of the CMS.
