# Q25 — DLI operational completion and security review (14 November 2026)

## Current verified production state
- Canonical release: `feature/stage-q5-production-bootstrap`, Cloudflare Pages `dli-platform-prod`, Supabase `thoinmwqxmqxrnywjuxq`.
- Before Q25 production commit was `e40d197328694c21b3e4f3595966c52f2d3309ce`; always confirm the exact new live canonical commit after release.
- Two active Founder/Owner and Admin accounts. **Real Tutor and Student accounts:** 0; Assistant Admin accounts: 0.
- Academic catalogue: 2 programmes, 7 levels, 15 subjects, 25 courses; published classes, tutors, members, offerings, lessons, assignments, quizzes, attendance records: 0.
- **No bank details** in the institutional bank register; no paid applications, Tutor bank details, transfer proofs or confirmed payroll records.
- **Paid admissions remain closed** (`paid_enrolment_open=false`) until real authorised administration enters independently verified recipient information and tests the application.
- The messaging database contains one private conversation and voice-media record. This does not confirm actual on-device playback or permissions.

## Implemented in Q25
1. Privileged public profile-view-audit and geocode-slot functions moved to the private schema; the original identity, role, audit and quota checks are unchanged. Public RPCs are now `SECURITY INVOKER`, exposed to authenticated identities only. Both operations passed a rolled-back authenticated Admin invocation.
2. Assistant Admin gets the same Paid Enrolment settings link as Owner/Admin, without changing unrelated restricted governance.
3. The settings page describes the actually deployed manual student payment and Tutor confirmation workflows rather than saying all payments are disabled.
4. A user-initiated browser notification permission control appears on the Member Profile page. It operates only while the web app is open; it does not imply offline push.

## External actions and real-user acceptance still needed
- **Real Tutor and Student accounts** need approved invitation and device acceptance; a real Assistant Admin identity is required to verify three-way finance parity.
- Configure institutional bank details; independently verify incoming transfers; test student proof upload, reviewer approval/rejection and access change. No fake transfer or approval.
- Test Tutor bank submission, administrator external payment and receipt upload, Tutor acceptance/dispute and payroll history with real consenting participants.
- Create and publish actual teaching groups, assign tutors and authorised students, set schedules, weekly JAMB tracks, Google Meet links, lessons, quizzes, grading and attendance. These require authentic class data.
- Audio/video capture and playback, private message visibility, read-receipt timing and alerts need independent Android/iOS/desktop testing with at least two real signed-in users.
- **QA password recovery redirect** remains a provider configuration issue (GitHub #44): inspect Supabase Auth Site URL, allowlisted redirects and mail template; update and verify through the hosted QA origin. Production Auth requires independent review.
- **Backup restoration** has no demonstrated off-site encrypted DB/Auth/Storage restoration rehearsal. GitHub source and migration history alone cannot restore private data.
- Supabase Auth compromised-password checking requires a separate provider dashboard/plan decision. Do not claim it is enabled until the Advisor confirms.
- External provider credentials remain missing for Google Drive synchronisation, delivered email/SMS/WhatsApp automation, offline Web Push/VAPID, live calls and approved AI integrations. They cannot be installed by flipping a frontend flag.
- Institution-approved safeguarding, consent, content retention and complaint moderation are prerequisites to enabling youth group chat, mass messaging and irreversible account erasure. Existing role-based privacy must remain enforced.
- Historical stacked GitHub PRs remain open. Reconcile them against the production commit; do not blindly re-merge old code or advance `main` without a repository-governance decision.

## Quality gates
- Verify SQL in a rolled-back production transaction and inspect post-migration Supabase Security Advisor.
- Require CI TypeScript, build, migration SHA integrity, source role guards, protected storage and Q25 security regression.
- Manually deploy exact merged production Git SHA to Cloudflare, verify canonical SHA and target Supabase project.
- Do not state that all features work for real students or tutors until authenticated role/device acceptance passes.
