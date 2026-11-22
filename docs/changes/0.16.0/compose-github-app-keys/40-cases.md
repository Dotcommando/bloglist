# Verification cases

- GH-C1. Production preparation retains the resource override and appends the GitHub App fragment when configured.
- GH-C2. Local Compose accepts an explicit directory. Removing the Client ID detaches the fragment and preserves other entries.
- GH-C3. Missing or unsafe default directories fail before writing configuration. Public-only preparation needs no private directory.
- GH-C4. Render both Compose configurations and verify a read-only directory mount into app only. In an isolated Linux container, verify service-user read access after production preparation.
