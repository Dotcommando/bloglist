# Design

Use the Bloglist breadcrumb structure with the CMS workspace heading, shared
icon and established `followAdminLink` route handling. The link targets the
current site's Files route and follows the existing turn back to the selected
folder. Ordinary activation is blocked during a file mutation. The current
name keeps the existing inline editor and permissions.

This UI adds navigation to an existing same-origin route. It adds no request
authority, storage, dependencies or backend changes.
