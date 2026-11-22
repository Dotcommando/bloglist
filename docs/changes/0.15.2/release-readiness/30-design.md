# Design

Use `cms-text-action` on the real Popover button, remove its local color override,
and retain the existing 44px action target. Extend real-browser computed-style
coverage instead of asserting class names. No API/dependency/schema change.
Use workflow-owned checks and clean source staging; verify tagged provenance and
service UID in images. GitHub connector supports repository/job inspection but
not the complete release/run-list operations; those reads use the GitHub REST API
with existing Git authentication kept in memory. Git handles authorized refs.
The published archive/checksum is the local update boundary. Preserve site-owned
files and stage only update paths in its commit. Never transport private site data.
