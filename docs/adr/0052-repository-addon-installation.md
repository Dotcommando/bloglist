# ADR 0052: Install add-ons from repository releases

Date: 2026-11-01

Status: Accepted through the owner's installation request and explicit choice of
prebuilt runtime packages from GitHub Releases.

## Decision

The Add-ons page accepts a public HTTPS GitHub repository URL. Installation uses
its latest stable published release and exactly one uploaded asset named
`addon.runtime.gz`. Source archives, source compilation, npm execution, private
repositories, automatic updates and uninstall are outside this operation.
The archive contains only the prebuilt runtime package, never site connections,
business records, templates, Snippets or secrets.

Installation is global to the CMS process/installation. Current authenticated
administrators already have platform-wide site management authority. Validate
their session before reading the request, then check administrative access to the
initiating site before making any network request. Installing leaves every site
connection unchanged; enabling remains explicit.

Freeze the release tag, resolved commit, archive SHA-256, runtime manifest digest,
add-on identity/version and exact required CMS version. Persist this information
in global `addon_installations`, excluded from site dumps. A Pending record claims
the immutable identity before executing code; Installed acknowledges successful
runtime activation. Retries resume the same release and package. Identical
installed requests return their saved result without checking for updates.
Conflicting sources/identities reject. A failed activation retains Pending
metadata for an explicit retry; no background retry or data rollback is implied.

Use the existing verified runtime installer and its ownership/dependency/schema
checks. Packages declare exact `cmsVersion`; repository installation rejects a
missing or different requirement before evaluation or schema changes. Runtime
packages remain trusted executable code under ADR 0042, not sandboxed plugins.

Only fixed GitHub API/download hosts are contacted. Reject credentials, custom
ports, queries, fragments, arbitrary paths and unapproved redirects. Bound network
time, actual download size, archive expansion, record size and file count. Stream
payloads into private staging and remove staging after every outcome. One delivery
runs per process without an unbounded queue; concurrent activation through another
entry point rejects rather than racing the runtime registry.

This remains CMS 0.8.0. At the owner's request add the installation collection to
the consolidated baseline, extending ADR 0051. Beginning with subsequent schema
changes (0.8.1 or later), retain applied manifests and add new migrations.
Existing databases/receipts are not rewritten by this implementation.
