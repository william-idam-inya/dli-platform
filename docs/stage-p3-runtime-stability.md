# Stage P3 — Runtime stability and interface consistency

**Scope:** Development-only correction and validation. This stage is based on
`feature/stage-p2-member-profile-operations` and does not create a new database
schema or change any member-role assignment policy.

## Reported Vite error

The screenshot showed:

```
[plugin:vite:oxc] Transform failed
src/pages/ClassesWorkspacePage.tsx:293:15
Expected `}` but found `{`
```

The cause was an unclosed JSX conditional after the
**Report a class issue** link on the earlier P1 branch. That exact
syntax error was repaired directly on
`feature/stage-p1-academic-simplification-peer-support` at commit
`96983a01925fa4a01e95d9ecb7c0ad0a6731a883`.
GitHub validation passed for the corrected P1 HEAD:
https://github.com/william-idam-inya/dli-platform/actions/runs/43156244154.

The later P2 branch already contained that JSX correction, so the
same edit was not needlessly repeated or merged into P3.

## Additional stability fixes in P3

1. **First-login profile unlock:** The profile gate previously fetched
   the profile only when the account ID changed. Saving a first profile
   left the gate in the stale `missing` state until a reload.
   `ProfileSetupGate` now listens for the profile-saved event and
   independently re-verifies the row in Supabase before unlocking.
2. **Cross-device display preference:** The top-bar dark/light toggle
   previously saved only to the current browser, even though the
   Profile page promised synchronisation. The shell now retrieves
   `preferred_theme` from the authenticated user's private profile
   when the account is available and after profile updates.
   Top-bar changes are written to that profile too. Failures show
   a warning that the change was local-only.
3. **Birth-date validation:** A literal `2026-11-12` limit in the
   Profile editor would reject later valid birth dates. It now uses
   today's calendar date in `Africa/Lagos` consistently in the
   form and validation.
4. **Assistant Admin settings mismatch:** The route permitted Assistant
   Admin, but the view rejected the role. Assistant Admin now sees the
   already-authorised read-only publication safeguards. Founder/Admin
   group invitation links stay hidden from Assistant Admin; no new
   SQL permissions or role assignment delegation changes were made.
5. **Dashboard clarity:** The dashboard cards now use Academic setup,
   Classes & timetable and Learning & results, matching the three
   simplified Academic destinations. For Founder/Admin/Assistant Admin
   the feedback shortcut is **Support inbox & reports**, reflecting
   its review-only screen.
6. **Profile completion guidance:** After saving, the Profile screen
   offers a route back to the dashboard.

## Verification

- [x] Original P1 syntax regression corrected; its CI passed.
- [x] P3 TypeScript, source guard, migration integrity and Vite build
  checked by read-only GitHub Actions on the final P3 revision.
- [x] No production release, new learner data or payment actions were
  created.
- [x] Earlier restoration of Assistant Admin's delegated Tutor/Student
  invitation permissions is preserved unchanged.
- [ ] Authenticated browser verification of first-login completion,
  switching themes across two devices, and Assistant Admin read-only
  settings; there are no real Assistant Admin, Tutor or Student accounts.
- [ ] Independent Student/Tutor messaging, proof-upload and notification
  acceptance tests.
- [ ] Production backend separation, backups, controlled onboarding,
  safeguarding and verified email delivery remain launch blockers.

**Scope limit:** A successful TypeScript/build pipeline detects syntax,
static type and bundling problems. It cannot prove the absence of every
runtime bug, that a payment was really received, or that role-based
features work for users who do not yet have accounts.

## Local checkout

Use `feature/stage-p3-runtime-stability` for the latest integrated
work. Keep Vite stopped before switching branches; restart with
`npm.cmd run dev`. Avoid production deployment until independently
verified readiness gates pass.
