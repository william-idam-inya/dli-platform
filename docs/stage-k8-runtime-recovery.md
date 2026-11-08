# Stage K8 — Safe client rendering failure recovery

**Status:** code committed to the development feature branch. No
production deployment, database migration, new account, paid service
or external error-monitoring integration has been activated.

## Change

The app's root entry point, `src/main.tsx`, now wraps the existing
React Router and Supabase AuthProvider tree with a class-based
`RuntimeErrorBoundary`. This catches unexpected **render-time**
React errors anywhere below the boundary instead of leaving an
unrecoverable blank page.

The fallback provides:
- A concise, nontechnical error message and a **Reload DLI Platform**
  action.
- A privacy warning asking members to describe the affected page,
  without sharing passwords or private learner data.
- Accessible `role="alert"` and keyboard-focus styling, with
  light/dark theme support.
- No exception stack trace or user content displayed in the UI, sent
  to a third party, logged remotely or persisted in a database.

The new components are:
- `src/components/RuntimeErrorBoundary.tsx`
- `src/components/RuntimeErrorBoundary.css`

The existing authentication, router, academic records, feedback
operations, security guard scripts and Supabase schema remain
unchanged.

## Scope and limitations

React error boundaries handle rendering/lifecycle errors in their
child tree. They **do not** automatically catch errors from
asynchronous work, event handlers, external server requests,
uncaught promise rejections or errors outside React. Existing pages
must keep handling request failures, permission denial and
retry/error states themselves.

A reload can lead to a fresh authentication check; no promise is made
that the previous client-only editing state is preserved. A user should
check for a saved result before retrying a failed submission.
This is a safe fallback, **not** a complete error-monitoring system
or a replacement for API/performance monitoring.

## Prior Stage K7 evidence

An Admin screenshot on 9 November 2026 shows the `/feedback` route,
navigation, privacy notice and submission form loading successfully.
It does not show the lower administrative review panel or demonstrate
a completed submission. K7 SQL isolation checks and automated
builds were previously successful, but independent Tutor/Student
browser testing and privacy approval remain outstanding.

## Acceptance checklist

- [x] Implementation committed on `feature/stage-k8-runtime-recovery`.
- [ ] GitHub CI on the K8 branch passes all existing TypeScript,
      security guards and production-style development build.
- [ ] Local Windows browser still opens normal authorised routes.
- [ ] Controlled development-only render failure demonstrates fallback
      and successful reload; never deliberately throw in production.
- [ ] Distinct-role acceptance and approved retention/privacy procedure
      for real Tutor/Student feedback.
- [ ] Separate production provisioning, secure backups and restoration
      rehearsal remain outstanding.

Do not declare the platform production-ready based on this fallback.
