# ADR 0064: Direct TV editing and conditional page tabs

Date: 2026-11-07

Status: Accepted through the owner's CMS 0.10.1 editor request.

Follow-up: [ADR 0065](0065-tv-image-library-picker.md) replaces the image TV's
media select with a searchable modal library and new-image upload in 0.10.1.

The page editor previously exposed a Value source select before every TV input,
including fields with no configured default. The framed TV group mixed additional
fields with the main page form and obscured the task of changing an image.

Edit TV values directly, without a value-source selector, both on pages and in
the TV definition's default editor. Entering or selecting a value sets the page
override. Clearing text, Markdown or a media selection removes the override.
If a nonempty default is configured, show a localized hint immediately below the
empty input stating that the default will be used, including its text or media
filename. Otherwise leave the field empty without a default hint. Clearing the
default editor removes the configured default itself.

When saving page TV values, normalize empty assigned fields to absent overrides,
including previously saved nulls, empty strings, empty Markdown and empty media
identities. Keep nonempty and dormant-template values. This uses ADR 0040's
existing absent-value fallback and publication freezing; REST contracts still
accept explicit null for existing clients. No data migration or rewriting of
retained publications is introduced.

Show Main and Template variables tabs only when the selected HTML template has
assigned TV definitions. Main contains the existing page settings and content;
the other tab contains the TV editors without a surrounding fieldset or legend.
When there are no assigned TVs, show the ordinary main form without a tab bar or
tab-panel semantics. Switching templates updates this condition. Non-HTML
documents retain their existing main form.

Keep both forms mounted while switching tabs so editing and saving do not depend
on the visible tab. Use the shared tab styles with accessible selected states,
panel associations and ArrowLeft/ArrowRight/Home/End navigation. Native validation
returns to Main before focusing an invalid main field. TV load errors remain
visible even when no TV tab can be shown. Interface-language changes preserve
the active tab and form values.

This decision changes page-editor behavior only. It does not change media upload,
file replacement, publication, authorization or the Files library's contracts.
The existing TV media select and image-binding choices remain in this release.

Verification uses the built administration with intercepted synthetic HTTP data:
all four TV types, default and no-default clearing, draft payloads, tab state,
template changes, validation, load failures, both interface languages and shared
responsive viewport widths. Existing page-editor regressions remain applicable.
