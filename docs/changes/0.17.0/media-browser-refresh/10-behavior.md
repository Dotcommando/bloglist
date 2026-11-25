# Observable behavior

Files dims the visible results area during initial load, refresh, filter, sort
and pagination. The shared CMS spinner centers over the visible area. Existing
rows stay in place and filters remain usable. Failure clears the overlay, keeps
the previous results and leaves Refresh available to retry. The media toolbar
uses compact CMS controls and wraps on narrow screens. The same overlay applies
to Files and the shared media picker. CMS development defines this as the default
for updating data in place.
