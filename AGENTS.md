# Bloglist trial installation

This is a separate consuming site project on CMS Zarya 0.16.1, not the clean
cms-zarya source checkout. Bloglist source belongs in the sibling
zarya-addon-bloglist project. Consume fixed runtime artifacts through the CMS
registry; never import sibling src, use runtime symlinks or overwrite immutable
selected packages/claims. Keep host behavior changes in the CMS source project.

Use branch names without codex/ and honor an explicitly requested name.
Use MCP Serena for source discovery/edits. Use strict TypeScript, npm, the root
ESLint configuration and exact dependency versions. Run format, lint and affected
type/build/tests for source changes; do not run the whole test suite by default.
Observe asynchronous failures and close temporary applications and browsers.

The dedicated database is bloglist_trial. QA tooling may use only explicitly
isolated bloglist_trial_qa_N databases with separate runtime/data roots.
Fixtures are explicit authenticated API tooling, not startup seeds. Preserve
other databases and dependency services. Keep .env, credentials, screenshots,
runtime selections and private evidence ignored. Do not print credentials.

Do not start a persistent local HTTP app for the owner. Leave startup to the IDE;
close temporary verification listeners. Do not stop the MongoDB dependency.
Read the installed CMS/add-on contracts and add-on ADRs before boundary changes.
Report actual installation, migration and verification outcomes separately.
