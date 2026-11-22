# Verification cases

- GH-1. Adapter verifies a private release with a repository-scoped token and a redirect without credentials.
- GH-2. Adapter discovers a new arbitrarily named PEM while the previous file remains present and its key is revoked.
- GH-3. Public releases use anonymous requests. A missing public release preserves its existing error even if the key directory is unavailable.
- GH-4. A repository outside the App's grant does not receive an installation token. Missing or unusable keys fail safely and private staging is cleaned.
- GH-5. Exercise application composition and private download with a controlled GitHub peer through the existing repository installation and card update journeys.
