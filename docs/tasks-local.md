
# Tasks in the local Bloglist installation

[Русская версия](tasks-local.ru.md)

Build Tasks 1.0.0 in its own repository with `npm ci` and
`npm run build:runtime`. From the Bloglist site checkout, with CMS 0.16.1
built and the trial `.env` present, install the prebuilt package:

```powershell
node --env-file=.env scripts/install-tasks.mjs ../zarya-addon-tasks/artifacts/tasks-1.0.0
```

The installer uses the CMS registry for the existing `BloglistTrial` site and
prints the selected digest and connection status. Start the site from the IDE
and open **Tasks** in the admin menu. Settings are saved through the normal
CMS add-on connection. Keep the old standalone SQLite file as a recovery copy.

## Accounts and schedules

Create separate CMS users, roles and an access group under **Settings → Access**.
Add both users to the chosen group. Use the following Action grants.

| Account | Scope | Action IDs |
| --- | --- | --- |
| Hermes | Groups | `tasks.tasks.list`, `tasks.tasks.read`, `tasks.executions.list`, `tasks.executions.claim`, `tasks.known.check`, `tasks.state.read`, `tasks.state.update` |
| Hermes | Own | `tasks.executions.read`, `tasks.executions.renew`, `tasks.executions.finish`, `tasks.executions.cancel`, `tasks.artifacts.list`, `tasks.artifacts.read`, `tasks.artifacts.submit`, `tasks.reviews.read` |
| Codex | Groups | `tasks.tasks.list`, `tasks.tasks.read`, `tasks.executions.list`, `tasks.executions.read`, `tasks.artifacts.list`, `tasks.artifacts.read`, `tasks.reviews.list`, `tasks.reviews.read`, `tasks.reviews.write` |
| Codex with catalog writes enabled | All | `bloglist.bloggers.create`, `bloglist.blogs.create`, `bloglist.blogs.check-url` |

Create a template and task in that group. The template holds the instructions,
any required CMS Actions, and the artifact format or schema. The task holds
the context and repeat policy. Give the reviewer catalog grants only for an
approved workflow because Bloglist applies those grants site-wide.

Save each JSON configuration below in a private file under `.secrets`.
Substitute the local administration origin, site and task IDs, credentials,
and absolute paths. Use a private NTFS directory for the journal. Omitting
`taskId` lets the worker choose an eligible task and lets the reviewer
scan their pending queue.

```json
{
  "origin": "http://localhost:3003",
  "siteId": "<site ID>",
  "taskId": "<task ID>",
  "workspace": "C:/private/tasks-journal",
  "credentials": { "email": "<Hermes CMS user>", "password": "<password>" },
  "knownCheck": true,
  "workingContext": true,
  "model": {
    "driver": "hermes",
    "executable": "C:/path/to/hermes.exe",
    "timeoutSeconds": 180
  }
}
```

```json
{
  "origin": "http://localhost:3003",
  "siteId": "<site ID>",
  "taskId": "<task ID>",
  "workspace": "C:/private/tasks-journal",
  "credentials": { "email": "<Codex CMS user>", "password": "<password>" },
  "instructions": "<editorial review criteria>",
  "allowCatalogCreate": false,
  "model": {
    "driver": "codex",
    "executable": "C:/path/to/node.exe",
    "entry": "C:/path/to/node_modules/@openai/codex/bin/codex.js",
    "timeoutSeconds": 120
  }
}
```

Run each command from the Bloglist checkout or use it as a Windows Task
Scheduler action with this checkout as the working directory. Configure
each scheduled action to ignore a new instance while it is running.

```powershell
node scripts/run-tasks-client.mjs worker .secrets/tasks-hermes.json
node scripts/run-tasks-client.mjs reviewer .secrets/tasks-codex.json
```

The clients use separate CMS cookie sessions, timeouts and private journals.
A restarted worker resumes its lease and reuses saved output and
idempotency keys. The reviewer processes one artifact per run by default.
When `allowCatalogCreate` is enabled, it confirms the Bloglist catalog writes
before saving an approved review with the catalog IDs. If a run exits with an
error, the next scheduled invocation can reconcile the saved request.

## Isolated verification

```powershell
node --env-file=.env scripts/check-tasks-integration.mjs ../zarya-addon-tasks/artifacts/tasks-1.0.1 --upgrade ../zarya-addon-tasks/artifacts/tasks-1.0.2
```

The check creates a fresh `bloglist_trial_qa_*` database and private runtime
root, uses temporary loopback HTTP listeners and Chrome, and exercises
installation, scoped permissions, lease contention, review feedback, catalog
writes, browser navigation, restart after response loss and compatible
upgrade. Point `BLOGLIST_CHROME_PATH` at the Chrome executable as needed.
Set `TASKS_QA_HERMES_EXE` and `TASKS_QA_CODEX_ENTRY` to test local models against
a fictional artifact. With one variable set, the other role uses fixture output.
The check stops its own listeners and browser when it exits.
