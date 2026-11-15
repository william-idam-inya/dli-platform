# Q29 — Owner/Admin editable Paid Learning Plan reference (15 Nov 2026)

## Reported incident
On https://dli-platform-prod.pages.dev/finance, the three pricing cards
were hard-coded in \`src/data/paidLearningPlans.json\`.
"Group of 5 (Science)" still appeared despite the user's requested
neutral name **Group of 5 Students**.
The owner and admin could submit proposal records but could not change the
actual displayed pricing reference.

## Implemented
- One internal Supabase catalogue table \`public.dli_paid_plan_settings\`,
  seeded from the previous document figures, with the approved first-plan
  name corrected. Stable identifier \`group_5_science\` remains for compatibility;
  it is an opaque key, never the displayed label.
- Owner and Admin can edit and save names, class model descriptions, students,
  tutors, subject counts, weekly hours, monthly student fees, tutor compensation,
  data allowances and clarification notes from the Finance page.
- Assistant Admin can read but cannot edit this particular master reference.
- Server-side permission checks use \`private.current_role()\` for an active
  authorised account, RLS, column-scoped UPDATE grants, audit trigger and
  an append-only revision history table. No client-supplied updated_by or
  version is trusted.
- Concurrent administrators cannot overwrite an unseen revision: an
  UPDATE must match the prior revision. If it doesn't, an error asks the editor
  to refresh and review the latest values.
- A saved revision is visible on the Finance cards, and the editor displays
  the prior revision metadata.
- If Supabase cannot verify settings, the UI shows an explicitly labelled
  offline copy, disables editing and preserves the existing values instead
  of reporting false success.
- The original JSON fallback also uses the corrected group name.
- Text, currency, numerical limits and length are checked in the browser,
  and the SQL table independently applies CHECK constraints.

## No automatic activation
This is a **reference catalogue**, not a live fee engine.
No automatic activation of student billing, payment collection, payment
proof approval, tutor payroll, admissions, or approved fee calculations.
Existing records are never silently repriced. Bootcamp-specific pricing
is kept separate. Rate changes will require separately approved integration
into operational fee rules if that becomes a future requirement.

## Safeguards and acceptance
1. Run Q5–Q29 CI checks, TypeScript and build; QA Supabase migration first,
   then explicit read-back verification and security advisors.
2. Confirm Owner/Admin can view, edit, save/reload and inspect revision history
   using real authorised accounts.
3. Confirm Assistant Admin can see but cannot update; reject Tutor, Student,
   Academic Coordinator and anonymous access at the database layer.
4. Simulate concurrent edit: only the update with the latest revision succeeds.
5. Validate 3 rows: \`group_5_science\` -> Group of 5 Students, group_10 and
   private_one_to_one; verify defaults remained unchanged numerically.
6. Validate no inserts/deletes via the API, no unauthorised edit, no forged
   audit metadata, no new permissions to invoice or payroll features.
7. Promote reviewed migration and frontend to production, then verify
   Cloudflare commit and live /finance page on an actual authenticated browser.

Notes: Live E2E role tests require logged-in user sessions. Staged SQL grants
and policy catalogues can be verified independently of those sessions.
