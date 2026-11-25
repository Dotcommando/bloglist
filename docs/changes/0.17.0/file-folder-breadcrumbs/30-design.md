# Design

Share the file card breadcrumb styles with the media browser. The current
folder is a text item with `aria-current="page"`. Workspace parent links
reuse the Files route with `root` and `folder` query parameters. The browser
validates the root and folder ID shape. Existing authenticated folder reads
remain authoritative for the site and folder scope. The file picker still
changes its selection within the dialog.
