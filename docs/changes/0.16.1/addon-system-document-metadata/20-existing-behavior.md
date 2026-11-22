# Existing behavior

The content API already reads the system document role. The add-on host
projection kept only page ID and title, so Events offered the same choices in new
and retained records. The same authorized site supplies all page summaries.

The [QA defect](../../../defects/qa/addon-browser-promise-target.md) found at
release preflight affects two tests in the host probe's suite. Their held
responses still release on the same paths after the compatibility correction.
