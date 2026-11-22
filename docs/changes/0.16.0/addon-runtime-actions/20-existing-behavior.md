# Existing behavior and boundaries

- [Add-on authorization](../../../addon-development/authorization.md) owns declaration shape and intended enforcement.
- [Live updates](../../../arch/live-addon-updates.md) own process replacement, immutable digests, update recovery and exclusive admission pauses.
- [Site add-ons](../../../arch/site-addons-contracts.md) own configuration, connection permits and assets. Existing packages without declarations use their established administrative boundary during migration to declared runtimes.
- [Site dumps](../../../arch/site-dumps.md) own full restoration. The source archive contains Events and Inbox data and requires the original site identity and matching schema.
- [Defect index](../../../defects/addons/README.md) covers disposal of rejected runtimes and preserving the real activation failure.
