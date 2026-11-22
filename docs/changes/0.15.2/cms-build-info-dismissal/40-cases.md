# Cases

Browser regression uses the real Vite/Svelte bundle and explicit Chromium-family
browser with fully intercepted synthetic HTTP; no persistent server or database.
At desktop/mobile widths: open; click metadata and retain it; dismiss with Escape
and restore trigger focus; reopen and dismiss by outside click; reopen and toggle
from the trigger; activate using Enter/Space. Check popup remains inside viewport
and no page errors appear. Existing deployment-ui scenarios preserve responsive
header/deployment behavior. No unit test of declared handlers/classes adds proof.
