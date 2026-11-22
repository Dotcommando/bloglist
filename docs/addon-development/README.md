# Add-on development

Build add-ons in their own projects. An add-on owns a business capability, its
data and migrations, and any interfaces needed to use that capability. CMS
supplies generic host contracts. Site projects own installation, configuration
and site content. See the [clean distribution boundary](../adr/0037-clean-cms-and-site-installations.md).

| Document | Use it for |
| --- | --- |
| [Feature lifecycle](feature-lifecycle.md) | Take an add-on change from scoped behavior to a verified runtime artifact. |
| [Code standards](code-standards.md) | Design, layers, SDK boundaries, data, HTTP, server extensions and administration. |
| [Authorization](authorization.md) | Declare Actions and domains, bind access to routes and screens, and distinguish implemented host behavior from planned delegation. |
| [Testing](testing.md) | Select tests, run the actual host in isolation and collect evidence for the relevant boundaries. |
| [Runtime packaging](runtime-packages.md) | Pin the SDK, build a runtime, consolidate migrations on major upgrades and verify the selected artifact. |

Start with the [add-on lifecycle](feature-lifecycle.md) and the owning project's
instructions. For changes to CMS or the shared SDK, use
[CMS development](../cms-development/README.md) in the CMS repository and verify
the affected boundary with an installed add-on.

The [site add-on contract](../arch/site-addons-contracts.md) describes what the
current host supports. The [live update contract](../arch/live-addon-updates.md)
owns runtime selection and update behavior. The
[server API guide](../guide/en/README.md) describes the `cms` interface.
