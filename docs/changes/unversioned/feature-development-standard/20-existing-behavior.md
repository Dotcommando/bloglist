# Affected existing behavior

- [Root instructions](../../../../AGENTS.md) already require reading the development
  standards. They now also route continuation work to the feature dossier.
- [Lifecycle](../../../cms-development/feature-lifecycle.md) previously kept feature notes
  in chat/PR and prohibited status artifacts; the owner's new request supersedes
  that arrangement.
- [Testing policy](../../../cms-development/testing-policy.md) already requires focused
  tests, meaningful regressions, isolated dependencies and integration completion.
  Preserve these guarantees while specifying the backend TDD cycle and exclusions.
- [Existing-feature review](../../../cms-development/existing-feature-review.md) preserves
  bounded audit evidence. Remediation now links to a resumable dossier instead of
  prohibiting progress artifacts.
- [Documentation instructions](../../../AGENTS.md) own document placement and both
  changelogs. Add the feature-knowledge location without duplicating the convention.

Earlier uncommitted changes also extracted shared rules from scoped instructions
and both READMEs. Preserve them; this request extends that work rather than
reverting its approved integration-before-completion rule.

The [shutdown audit](../../../audits/0.15.0-worker-shutdown.md) contains two confirmed
historical bugs with linked regressions: disconnected dispatch leaking admission
and an optional public-only composition depending on admin providers. These seed
the new [defect routing index](../../../defects/README.md); no new runtime fix or
test run is claimed. Other historical audits are not comprehensively catalogued.

The instruction audit covers all 12 repository AGENTS.md files, including hidden
`.github/` and `ops/`. Before this request they contain 490 lines, 3,716 whitespace-
delimited words and 29,646 UTF-8 bytes in total. The root contains 70 lines and
447 words; admin/src contains 185 lines and 1,607 words, mostly unique UI rules.
Repeated generic routes and central design/security/test rules can be shortened;
local permissions, release/migration integrity and UI interaction rules must remain
or point to an existing verified owner. Existing uncommitted work is preserved.
