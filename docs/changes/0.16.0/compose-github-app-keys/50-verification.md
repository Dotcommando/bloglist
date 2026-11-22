# Verification

All three new preparation cases failed against the baseline as expected. The
preparation and release-consistency suites then passed five tests. Formatting,
lint, typecheck and whitespace checks passed.

Docker Compose rendered both base configurations with only app receiving the
configured read-only bind mount. A public-only render omitted the mount. In
temporary Linux containers using the pinned Node base image, UID/GID 1000 read
the fake key through the resolved mount and writes failed with EROFS. Linux
production preparation in an isolated filesystem gave UID/GID 1000 access to
original and replacement fake PEMs, including a restrictive upload corrected
by rerunning preparation. No production access or deployment was needed.

No confirmed bugs or vulnerabilities. No defect records created.
