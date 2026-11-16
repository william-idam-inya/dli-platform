# Q42 — Slide-away sidebar and full-screen workspace

Desktop sidebar can be hidden using a clearly labelled control at the start of the top navigation. The main panel then expands across the viewport. Click the same icon to restore the sidebar. The preference persists in browser local storage and follows all DLI roles and modules.

Focus overlays automatically slide the desktop sidebar aside to avoid covering the form; closing the overlay restores the user's prior state. The red-rim guided tour temporarily reveals the sidebar when explaining navigation, without overwriting the saved preference.

The desktop sidebar is removed from keyboard focus when collapsed using the native inert property and an aria-hidden state. On mobile the original More drawer is unchanged and no duplicate desktop toggle appears. Reduced-motion settings disable animation.

Validate on wide desktop and 681–900px, reload persistence, existing chat and profile focus overlays, tour navigation spotlight and phone drawer before considering release complete. No database, permission or billing changes.
