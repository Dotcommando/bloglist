# ADR 0038: Add-on navigation, shared administration styles and site time zones

Date: 2026-10-28

Status: Accepted through the owner's explicit interface request and follow-up answers.

## Decision

The Add-ons section lists installed definitions with connection settings and
Enable/Disable. Working screens belong to registered add-on navigation entries.
The trusted definition can provide a bilingual adminMenu. The reserved private
configuration field adminMenuLabels overrides its labels per site and interface
language; empty labels use the definition. Catalogue responses expose only these
presentation labels, never other private configuration. Retained missing packages
remain manageable through lifecycle APIs but are not advertised as installed UI.
Disabling retains the menu and existing-record administration, marked as disabled.

The CMS hosts ordinary lazy Svelte components and loads shared CSS once. It owns
theme classes, site-scoped authenticated requests, navigation/history, unsaved
changes/busy state, and scroll-shadow behavior. There is no declarative form builder
or separate frontend application. Version 0.2.0 of addon-contracts exposes this
explicit host boundary. The core registries remain empty.

Site Settings owns a validated IANA timeZone, with UTC for existing/unconfigured
sites. Settings GET returns it separately from addresses. Settings POST accepts
{timeZone, expectedTimeZone}, or the existing guarded address command; actor
identity is still obtained from the administrator session. Updates use the existing
site transaction guard. Invalid values fail, stale settings conflict. The selector
includes Asia/Nicosia, even where the runtime lists its canonical Europe alias.

The site time zone controls calendar display, current dates and local time entry.
Changing it does not rewrite UTC event instants or recurring schedules. New Events
schedule input is converted once into UTC. Its repetition follows fixed UTC times;
seasonal display offsets can change. Explicit schedule editing applies to future
series occurrences under existing identity, booking and exception rules. This
supersedes older local-wall-clock administration guidance for this installation.

The add-on package is @zarya/events in zarya-addon-events. Its persisted connection
key remains participation, preserving existing records, migration receipts, public
widgets and routes. Only site installations depend on that package.

The administration starts at 320px and uses 576/768/992/1200px breakpoints. Monthly
cells show counts on narrow screens and timed titles on larger screens. Calendar,
day, occurrence, recurring schedule and settings are addressable history entries.
Navigation retains the selected month/day and independent scroll positions.

See the add-on's interface contract for its Calendar/Schedule/Settings screens.
