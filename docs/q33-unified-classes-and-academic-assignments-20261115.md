# Q33 — Consolidate Academic Assignments into Classes & Timetable

## Design decision

Classes & Timetable is the single *operational* workflow. Academic Setup continues to own the reusable course/subject/programme catalogue; Advanced curriculum remains available for approved legacy academic records, topics and cohorts. The old **Academic Assignments** navigation entry is retired and its bookmark redirects to the Classes workspace. Historical `tutor_assignments` and `student_enrolments` data are **not deleted**.

Each new class now saves an academic level, one or more approved courses, a **primary and second (distinct) tutor per subject**, the class start date, enrolled students and a weekly timetable with a single Meet link. The class is initially a draft.

## Server integration

A new narrow `dli_save_unified_class` call wraps the original validated `dli_save_teaching_group` in one transaction. It registers a dedicated cohort and two verified tutor assignments per subject without exposing privileged write access to the browser. Saving a draft does **not** grant paid access.

On publication, `dli_set_unified_class_state` creates approved matching course offerings and writes both tutor links and the same student roster to the former academic assignment tables. It then links each paid subject and publishes the entire timetable within one transaction. The strict Q10 paid roster, subject/course, entitlement and offering-link checks are retained. Free Scholars Club classes deliberately remain unlinked to private paid offerings.

Archiving the group archives the timetable and deactivates its dedicated academic cohort, offerings, tutors and student links, preserving their records and audit history.

The second tutor may view that subject's timetable, roster and applicable published course material under the same active class restrictions; Q32 profile subject visibility recognises either assigned tutor. Primary tutor remains the person tied to the existing Tutor Payroll calculations. **No automatic payout is created for the secondary tutor**; finance policy must be agreed before altering this.

## Responsibilities and limits

- Admin and Assistant Admin create/publish classes as before. Founder/Owner retains governance visibility.
- Tutors must be two distinct, active, verified DLI Tutor accounts. This is validated on the server as well as the form.
- The extra two-tutor requirement applies to **new unified class drafts**; historical classes are not rewritten or wiped. Legacy class status controls remain available when appropriate.
- An individual course still has one weekly scheduled session in this model. Repeated weekly sessions or custom alternating tutors would need a separately designed scheduling change.
- No fabricated accounts, payments, student approvals, signed Meet URLs, or student records.

## Validation

CI source checks + TypeScript build; apply migration in development, review private SECURITY DEFINER/public INVOKER function grants, test staff role rejection and positive cases using authorized test accounts, deploy QA and verify. Then apply to production **before** production UI build. Do not claim full classroom and payroll browser testing until at least two distinct tutors and eligible students exist in the relevant environment.
