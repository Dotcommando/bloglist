# Behavior

The normal Compose preparation step configures the optional GitHub App mount for production and local Docker. An operator who has already configured the Client ID and copied PEM files to the standard private directory uses the normal upgrade procedure. The app receives the directory read-only and reads it as the service user. Public-only installations require no key directory.
