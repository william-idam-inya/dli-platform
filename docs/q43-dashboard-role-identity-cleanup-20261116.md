# Q43 — Remove repeated role branding across dashboards

The desktop screenshot annotated **green** the official DLI brand at the sidebar top and the actual logged-in member's avatar/name/role at the top right. Both must remain visible.

The screenshot annotated **red** the static `DLI Workspace · Admin` selector (not a working switcher), the extra `Admin` role beneath the greeting and the `Admin` in `Admin Dashboard`. Remove those duplicated role mentions without removing true permissions.

## Changes
- The duplicate sidebar logo/role tile is removed, freeing vertical space in both desktop and mobile drawer navigation. The official branded DLI header remains.
- The desktop greeting shows `Your personalised workspace` rather than a second role string.
- The hero headline is `Dashboard` for all non-student accounts; Student retains `Welcome to DLI`. Hero explanatory copy retains role-appropriate content but no repeated role prefix.
- The top-right account avatar, full name and authoritative role are unchanged. Mobile identity retains the student tier and authorised role.
- Owner, Admin, Assistant Admin, Tutor and Student still use the existing permission-scoped nav, modules, learning, finance and messaging. No role changes or database migration.

## Verification
CI Q43 and earlier test suites, TypeScript, Vite build, then exact Cloudflare **main** production commit. Screenshot-level review on desktop/mobile after deployment.
