# Developer guide

[Русская версия](../ru/README.md)

Use the server-side cms object API from trusted Snippets and add-ons. It returns
typed data and invokes the existing owning application operations.

1. [Getting started](getting-started.md).
2. [Concepts and execution](concepts.md).
3. [Server API reference](reference.md).
4. [Recipes](recipes.md).
5. [Indexes and read costs](indexes.md).
6. [Troubleshooting](troubleshooting.md).

The public contract is SDK 0.4.0, exported from
@zarya/addon-contracts/cms and /cms-extensions. Its source is
[the portable API declaration](../../../packages/addon-contracts/src/cms.ts).
Architecture and accepted policy are in [ADR 0044](../../adr/0044-system-object-api-and-bilingual-guide.md)
and [the implementation contract](../../arch/system-object-api.md).
For building, testing and packaging add-ons, see [add-on development](../../addon-development/README.md).
