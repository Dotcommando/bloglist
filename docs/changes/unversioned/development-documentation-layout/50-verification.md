# Documentation verification

A repository-wide Markdown scan checked 209 links and their anchors across 70
files, including incoming links and links from the relocated sections. The scan
found zero invalid links and zero references to the previous paths. The tracked
source scan checked for stale literal paths outside Markdown. `git diff --check`
passed.

The package metadata still reports CMS `0.15.3` and SDK `0.5.0`.
The [add-on authorization page](../../../addon-development/authorization.md)
identifies `0.16.0` as the target and distinguishes the currently supported
behavior from pending runtime registration and delegation. No runtime behavior
changes were part of this documentation commit.
