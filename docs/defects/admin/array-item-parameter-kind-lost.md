# admin/array-item-parameter-kind-lost

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: baseline 084c36b; earlier range unknown. Fix target: 0.16.0.
Tags: parameters, Array, recursive-editor, type-change, defaults, bindings.

Changing the item type of an Array parameter did not update its parent contract.
The recursive editor receives a temporary one-item array through a function
binding. Replacing an entry of that array mutates only the temporary array,
without invoking the binding setter. The Enum values control consequently never
appears. The same replacement pattern is used when editing a typed default.

Regression: `round-trips nested parameter kinds, falsy defaults and removal in
templates/chunks` in [browser suite](../../../test/integration/admin-rendering-ui.integration.spec.ts).
Observed RED against the unchanged built administration: after selecting Enum
for Array items, the existing `-items-0-values` control never appears (4s timeout
for both Template and Chunk). IDs and rendering condition verified against
ParameterFields. This is a browser binding defect, so the real built component
is the owning regression boundary.

Correction: assign the complete fields array when replacing
an entry, so both normal binding and the Array-item function setter receive it.
Retain recursive structure and falsy/null/absent default distinctions.

Focused GREEN observed for both Template/Chunk cases, Array item defaults and
the shared Snippet structured result editor. An already-open unsaved contract
must be corrected through the type selector after loading the fixed UI; saved
contracts are unchanged. Full follow-up gate passed: 140 cases in 19 files. The owning
[editing contract](../../arch/rendering-element-editing.md) records propagation
through recursive parent bindings as the durable guarantee.

Equivalent entry-point review found the same one-item function binding for the
Snippet result root in ElementEditor. The shared correction applies there too;
the structured-result scenario checks its saved contract and reload. Object
properties use a normal parent array binding and keep their existing behavior.

[Follow-up evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).
