# Command Palette

The command palette component lives at frontend/src/components/CommandPalette.tsx and exposes a small API to register actions:

- registerAction({ id, title, href?, keywords?, onExecute? })

Keyboard shortcuts:
- Cmd+K / Ctrl+K: Open/close the palette
- On mobile a visible Search button (the Navbar Search button) opens the palette

Recent actions are persisted to localStorage under key bridgewatch:recent_actions.

To register actions, import registerAction from the component and call it during app initialization or component mount. Example:

import { registerAction } from "../components/CommandPalette";

registerAction({ id: "goto-dashboard", title: "Go to Dashboard", href: "/dashboard", keywords: ["home", "start"] });
