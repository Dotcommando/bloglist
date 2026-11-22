# ADR 0071: Retain verified Request-plan content fingerprints

Date: 2026-11-10

Status: Accepted through the owner's CMS 0.12.0 implementation request.

## Decision

The published-plan adapter computes an optional contentFingerprint after full
plan and asset-reference verification. It hashes the same serialized stored
site/release/plan/assets object previously hashed before every document lookup.
The fingerprint is derived metadata, never trusted from a saved plan envelope.
The parsed-plan cache retains it with the detached verified snapshot, under its
existing budgets, eviction and maintenance generation fence.

RenderPublishedPage uses the supplied fingerprint for document identity. Legacy
port implementations without it retain the existing digest fallback. The outer
document key continues to include site, release, plan, path, language,
representation and normalized typed request values. Mutable caller copies never
modify the retained snapshot or its fingerprint. No active-release or live
authorization decision is retained. The persisted plan format is unchanged.
