# Administration localization and source layout

Feature follow-up on branch `0.16.0`. The working tree already contains the
RBAC and other 0.16.0 changes. Preserve their behavior and source edits.

Administration source uses feature directories, shared controls and a central
locale registry. The typed dictionaries supply the selector and interface copy.

The build, source checks and focused localization browser scenarios passed.
The wider browser run also reproduced eight existing failures on the preview
bundle from before this refactor. See [behavior and scope](10-behavior.md),
[verification cases](40-cases.md) and [results](50-verification.md).
