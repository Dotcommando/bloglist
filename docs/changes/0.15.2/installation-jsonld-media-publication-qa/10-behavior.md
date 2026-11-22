# Scope and accepted behavior

Continue on branch/target `0.15.2` after committing the previous auth/users/pages review.
Review all operations in `src/app/use-cases/installation`, `json-ld`, `media` and
`publication`, including actual adapter methods and inbound/consumer boundaries.
Follow [existing-feature-review](../../../cms-development/existing-feature-review.md).

Preserve current approved contracts and clean-CMS isolation. Test business results,
forbidden effects, failures/partial outcomes, ownership and resource lifetime rather
than declarations or fixtures testing themselves. Use executed RED/GREEN for actual
behavior fixes and real isolated integrations before completion. Delete only tests
whose missing/redundant guarantee has been assessed.

An error correction must eliminate the actual failure mechanism or complete its
owned recovery, preserve truthful committed/active state and supply an actionable
business outcome where needed. Logging, empty success and dead-end operator
notifications are not recovery. Research existing contracts/precedent first; ask
the owner only for a material unresolved business/recovery policy.

No full-suite run, deployment, owner-site data reset, persistent app startup or
business add-on installation is authorized. Completion includes the bounded audit,
actual checks/limits and a numbered classified inventory of newly recorded defects.
