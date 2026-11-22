# Design

Replace the details disclosure with the existing Bits UI Popover trigger/content,
including its portal and keyboard/outside-interaction lifecycle. Keep the existing
visual classes and data; use collision padding and a bounded popup width.
Use the shared component's cleanup/focus behavior instead of document listeners.
No new dependencies, API, storage, permission or rendering of untrusted HTML.
No backend TDD/integration database obligation applies to this browser-only fix.
