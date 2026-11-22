# Backend boundaries

General standards follow the root reading route. Read the owning maintained
contracts only for affected boundaries:

- `docs/arch/rendering-and-publication.md`, `public-delivery-and-page-restore-contracts.md`,
  `site-editing-and-url-behavior.md` and `url-workspace.md` for publication/routing.
- `docs/arch/snippets.md`, `parallel-snippet-execution.md`, `snippet-worker-pool.md`,
  `system-object-api.md` and `site-addons-contracts.md` for execution/extensions.
- `docs/arch/0.14.0-site-process-allocation.md`, `resource-calibration.md` and ADRs
  0083-0086 for coordinator-owned forks, database pools and resource management.
  Process slots, Worker threads, connection pools, CPU quotas and observed load
  are separate quantities. Do not invent memory/connection-derived process caps.
- `docs/arch/streamed-file-io.md` and ADR 0048 for exact file-I/O behavior.
