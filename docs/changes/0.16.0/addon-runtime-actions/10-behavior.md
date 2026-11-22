# Observable behavior

An installation administrator can activate a validated add-on runtime. Its
Actions appear in the CMS catalog under their declared domains. A site
administrator can grant supported scopes to a role for the connected site.
An unchanged Action retains its grants across an update. A removed or widened
operation cannot acquire authority from a previously granted identity.

An authenticated user with a screen's required grants can open it. Missing
operation grants are explained where the user can act on them. The selected
runtime and its Action authorize every declared request before its body is
consumed. An unauthorized request leaves private data and business state intact.
The owning operation checks predicates within the site and writes under the
current authorization and connection fences. Public routes retain public
admission and their own site and availability checks.

Verification uses an installed synthetic runtime, then packaged Events and Inbox
on an isolated copy of the supplied site. No add-on release is part of this work.
