# Q27 — DLI Academic Pro design and accessible customisation (15 November 2026)

## Goal and scope

Modernise **visual presentation**, mobile readability and the learner-first
workspace while retaining the official DLI-ONLINE book/cap emblem, all existing
routes, the current six-role authorisation model, private messages, manual bank
verification, tutor payout acknowledgement and child-safeguarding constraints.

This is **not** a claim that pending real-user acceptance, payment onboarding,
password-recovery configuration, provider credentials or restoration tests are
complete. It does not turn on paid enrolment or create demo users.

## Design decisions

- Default light UI: academic royal blue (#184B91), deep navy (#112744),
  restrained gold (#E2B64F), white and #F5F8FC background.
- Dark UI uses navy surfaces, readable text and brighter accent colours.
- The approved DLI emblem remains the exact existing \`/dli-mark.svg\`;
  gradients, original circles and icon treatments are CSS/vector graphics.
- Replace the repeated photographic backgrounds on dashboard cards with
  readable solid surfaces and differentiated academic icon tiles.
- Keep four role-priority mobile navigation destinations, the More drawer
  and all current role-scoped routes. Improve touch/readability on narrow screens.
- Dashboard headline, contextual call-to-action and supporting text vary by
  Student, Tutor, Academic Coordinator and institutional admin roles.
  Actual class/academic counts remain database-backed; **no fabricated KPIs**.
- User Management moves its long permissions explanation into a discoverable
  disclosure, provides registry and invitation jump links, removes the internal
  Stage C tag and does **not** suppress underlying errors.
- Learning tab graphics are distinguished through consistent semantic icons
  and purposeful accent shades. Real class sessions display original vector
  subject pictograms selected from their actual subject names (Mathematics,
  Biology, Physics, Chemistry, English and Digital Technology, with fallback).
- The dashboard links to Appearance for all six authorised roles. Existing learning entitlements remain unchanged.

## Functional personalisation

Every authorised member can open **My profile → Appearance & accessibility**:
- Blue / Gold / Teal accent (default DLI Blue)
- Comfortable / Compact layout spacing
- Standard / Larger reading size
- Follow-device / Reduce motion
- Reset appearance

Settings apply immediately and persist in this browser via \`dli-appearance-v1\`.
Storage failure is disclosed; no false save claim. Existing **light/dark
preference** remains separately synchronised through Supabase and is not
replaced by the device-only settings. The presentation preferences never enter
server roles, permissions, or payments.

## Release safeguards

- CI: static Q27 appearance contract, existing Q5–Q25 release checks, TypeScript,
  browser bundle scanner and build.
- Preview and inspect at mobile widths 320, 375, 390 and 430 px, plus desktop
  1280+ px, in both light and dark. Confirm focus ring, touch reach, contrast,
  and the More menu. Reduced-motion and larger-text choices need real-device checks.
- Conduct authenticated role-based review on actual test accounts. Preview
  artwork is **illustrative only**, not an app screenshot or actual analytics.
- Preserve QA/production Supabase isolation. No new migrations, key changes,
  Edge Functions or database record changes are required for this UI stage.
- Promote only after CI passes and production-target validation succeeds.
  Cloudflare production deployment is a separate action; a Git merge is not proof
  of published site content.

## User-visible confirmation checklist

1. DLI blue/gold identity on every route and the original institution logo.
2. Admin, Tutor, Student and Academic Coordinator home headlines are contextual.
3. Profile Appearance controls visibly change the interface and survive reload.
4. Browser permission and theme preference controls are unaffected.
5. Mobile bottom navigation, modal workflows, messaging and protected finance
   permissions remain accessible.
6. User list, invitation form and audit trail continue to function.
7. Paid admissions and all external services keep their existing gates.
