# Design

Ship an app-only Compose fragment and register it during release preparation when a GitHub App Client ID is present. Bind the configured host directory read-only with auto-creation disabled. The optional host path defaults to the established installation directory. Linux production preparation running as root restricts the canonical default directory and PEMs to root and the service group. Explicit custom directories retain operator-managed ownership. No key bytes are copied, passed as environment variables or included in images.
