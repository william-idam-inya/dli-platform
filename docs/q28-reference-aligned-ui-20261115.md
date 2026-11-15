# Q28 — DLI Academic Pro reference fidelity (15 November 2026)

## User-approved visual specification

The provided image depicts student, tutor and admin phone workspaces, desktop
administration, a subject-class workspace, DLI royal-blue/gold palette and
appearance controls. It is a **concept** containing fabricated examples; this
release applies its structural and visual conventions to **real application
routes and data**, not as a screenshot image behind buttons.

## Implemented

1. Student: blue hero with original scalable cap/books illustration; four
   concise shortcuts; RLS-scoped published weekly class sessions; lesson,
   assignment and quiz participation panel. When no verified records exist,
   clear empty/unavailable states replace concept numbers.
2. Tutor: teaching banner with scalable laptop illustration; class and
   assessment shortcuts; permitted upcoming classes and teaching checklist;
   actual tutor-acknowledgement count from the private payout table.
3. Owner/Admin: blue chart illustration; role-scoped users, classes,
   submitted payment review and tutor payout counts; latest permitted audit
   records with a truthful seven-day snapshot; real action destinations.
4. Assistant Admin: finance permissions are retained but /users and
   /reports/audit remain inaccessible. The UI replaces those controls with
   permitted class-seat and operations views.
5. Academic Coordinator: curriculum/lessons/report shortcuts, without giving
   the role access to the restricted administrative functions.
6. Shared phone navigation: logo, user's saved private profile avatar,
   context greeting and accessible bell/message alerts. Profile and sign-out
   remain in More. Student and Tutor bottoms emphasise Home, Classes,
   Messages, Profile.
7. Desktop: dark academic-navy sidebar with blue active item and official DLI
   logo. Original vector SVG illustrations and sober cards replace generic
   photographic backgrounds on the landing dashboard.
8. Classes: subject banner uses real class and subject names; links open
   the existing authenticated learning hub with no fake course enrolment.
9. Existing role-specific Appearance controls remain functional: light/dark,
   accent, density, larger text, reduced motion, reset.
10. All former detailed tool lists, reports and academic content remain
    reachable by their navigation routes and expandable Home section.

## Safeguards

- No artificial "248 users", "68% completion", "18 classes" or invented
  payment totals. Display “—” when a count cannot be verified.
- No fabricated lesson completions: quiz participation is calculated only
  from visible published quizzes and recorded attempts, not a course grade.
- Every query uses the signed-in Supabase browser client and active database
  RLS. No privileged keys, migration or role-policy changes.
- Paid admissions, tutor payouts, live class creation and account invitations
  retain their separate operational verification and permissions.
- Accessible HTML/SVG components, not a static visual overlay.
- Run all existing Q5–Q27 checks, Q28 source fidelity test, TypeScript build,
  Cloudflare QA preview, then controlled production deployment.

## Outstanding acceptance

Authenticated mobile and desktop screenshot matching requires actual user
accounts for Student, Tutor, Owner/Admin and Assistant Admin. Do not claim that
a production deploy is proof of WCAG 2.2 AA or a fully functioning paid workflow.
Test at 320, 375, 390, 430, 768 and 1280 px; light/dark, large text and
reduced motion; validate accessible buttons and screen-reader announcements.
