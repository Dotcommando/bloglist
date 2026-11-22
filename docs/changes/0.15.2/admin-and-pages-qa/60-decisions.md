# Decisions

- Accepted: exact branch/target version `0.15.2`; requested three use-case areas
  and all actually involved adapter methods.
- Accepted: meaningful TDD/security coverage and removal of demonstrably useless
  tests, including context-specific obsolete assertions beyond the policy examples.
- Existing approved contracts define expected behavior; investigate unclear error
  policy first and ask the owner where a material answer remains non-obvious.
- No sub-agent delegation requested or authorized by repository instructions;
  perform this review in the current agent.
- Version metadata/release publication is not changed merely by creating a branch;
  packaging/version work is separate unless required by the final agreed changes.
- Do not infer a confirmed resource leak merely from a catch around endSession.
  Verify the pinned driver's actual lifecycle before introducing an error flow or
  tests for an impossible post-commit state. The owner requested this clarification;
  no choice between hypothetical notification/error policies has been made.
- The owner rejects dead-end user/operator notifications as error resolution when
  there is no actionable lever. Internal session/resource lifecycle must be handled
  by code, respecting actual driver guarantees and confirmed commit state. This
  supersedes the earlier hypothetical operator-versus-error question; the concrete
  ClientSession example is now in the shared error-design standard.
- Owner requests adding the two concrete removed-test anti-patterns to the testing
  examples: testing a locally invented creation implementation and checking the
  absence of an invented DI token. Both examples now identify the missing product
  guarantee and meaningful replacement; existing useful delegation/composition
  checks remain in place.
