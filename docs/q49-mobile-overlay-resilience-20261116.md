# Q49 — Mobile overlay resilience and contrast repair

## Issues confirmed from the 16 November mobile screenshots
1. Audio calls displayed clipped participant text within a large media card. The audio element remained a grid child despite being visually silent and could consume an auto grid track.
2. The compact navigation drawer showed an almost white background with low-contrast/light links in dark-theme use, while its z-index sat below the sticky topbar.
3. Quick Menu links opened in a header-relative floating layer outside the mobile viewport, partially cut off.
4. Universal focus panels had a bright oversized close control, dramatic backdrop and insufficient side spacing. The floating Messenger badge remained visible over the modal.
5. Audit also found chat forwarding mounted inside potential frosted containing blocks, plus inconsistent mobile panel/scroll/close constraints for profile, confirmation, conference and announcement overlays.

## Fix
- Audio element continues playing but is display:none, and its media card uses exactly one minmax(0,1fr) track; mobile calls become viewport-fitting, independently scrollable, with sticky call controls.
- Drawer is full-height navy with explicit high-contrast text and a sticky accessible close/header, above the sticky site header.
- Quick Menu is portalled to body, uses the actual trigger bounding rectangle to clamp its width/position, repositions on resize/scroll, closes by outside press/Escape.
- Focus sheets remain real mounted form state, within 8px phone gutters and the visual viewport, with compact dark close button and internal scrolling. Missing focus titles can use their first label.
- Forward dialog becomes a portal; remaining dialog families receive bounded heights and header/button accessibility.
- Student bank-transfer and tutor payout receipt previews also move to body portals, with mobile-bounded PDF/image viewers and sticky Close/Save access. These existing private transfer workflows are otherwise unchanged. The floating chat is hidden when modal overlays are active.
- Existing permission, messaging and call signaling backends are unchanged.

## Verification
CI includes Q49 source checks and existing Q14–Q48 gates, TypeScript and production bundle. Browser rendering with synthetic, exact styles at 360, 390, 414, 768 widths should check overlap, scrollWidth and reachability. Full authenticated multi-role test and real mobile keyboard/media device checks remain release gates; **do not claim full platform verification on CSS/static tests only**.
