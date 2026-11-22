# Documentation maintenance

Follow the root product scope. Resolve versions from their own package/release
metadata; the SDK version need not equal the CMS version.

Keep historical decisions/changelogs and immutable-data guarantees distinct from
current instructions. ADRs explain why a decision was made; maintained `arch/`
contracts and guide/installation pages explain current behavior. Correct stale
operational prose without rewriting implemented contracts, historical evidence,
applied migrations or the product's compatibility behavior as a side effect.
Explicitly mark superseded scope where it could be mistaken for current guidance.

English is primary. Update corresponding Russian user documentation when the
same behavior changes. Put architecture decisions in `adr/`, technical contracts
in `arch/` and boundary audits in `audits/`. General development standards belong
in [CMS development](cms-development/README.md). Add-on development workflow,
authoring standards, packaging and verification belong in
[Add-on development](addon-development/README.md). Scoped AGENTS.md files route
to their owning documents and retain local rules.
Work dossiers follow the [lifecycle convention](cms-development/feature-lifecycle.md#feature-knowledge-and-resume);
defect records follow [their procedure](defects/record-format.md).
Link owning standards/contracts instead of copying them.
Maintain release history in `../CHANGELOG.md` and `../CHANGLOG.ru.md`;
READMEs describe current setup/usage and link to changelogs, not release-by-release
history. Documentation-only verification follows
[testing policy](cms-development/testing-policy.md#source-checks-and-documentation-only-work).
