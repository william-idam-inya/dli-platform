# Q36 — Contact filtering, compact focus, consistent theme and integration disposition

## Implemented in this branch
- `New message` queries `dli_new_direct_directory()`, which reuses the existing authorised directory and excludes all historical 1:1 thread pairs. The visible chat inbox and deep links retain access to prior threads; the insert still relies on existing database role checks and duplicate recovery. If the RPC fails the chooser fails closed. The final empty state links to existing conversations.
- All shared `WorkspaceFocus` panels now have compact icon/title controls in a single horizontally scrollable, accessible row. Content remains mounted in its original React tree, with keyboard navigation, Escape and overlay close.
- Reuses the deployed blue/gold official DLI book-and-cap art as a background layer behind translucent, contrasting panels; dark and mobile themes are supported.
- No new external billing, secret, enrolment or student communication provider has been activated by this release.

## External provider audit and implementation gates
| Requested capability | Current real implementation | Remaining dependency / release gate |
|---|---|---|
| 1:1 audio/video | Supabase private Realtime signalling plus browser WebRTC STUN | TURN server key and real two-device network tests for restrictive networks |
| Group classes/seminars | Real role-scoped conference rooms, roster, chat, moderation | Cloudflare SFU account/app and server-mediated secure session auth; not provisioned |
| Manual fees / student verification | Existing production bank/receipt checks and admin review | Approved bank details and real payment/receipt testing |
| Automatic payment processor / payouts | Not connected | Founder approval of changed workflow, legal merchant account, keys, server-only verify/webhook handlers, refund/dispute rules, and idempotent audited reconciliation; must not auto-approve receipt uploads |
| Private files/media | Supabase private Storage and RLS-backed files, notes, lessons | Authenticated upload/download tests, content screening and retention policies |
| Alerts | In-app notices and browser Notifications while application is open | True background push requires service worker, push subscriptions, secure server endpoint, opt-in and provider setup |
| Lesson viewers / quizzes | Existing protected LMS, assessments and private-media features | Browser/device verification; third-party viewers only when content rights and isolation are reviewed |
| WhatsApp/email delivery | Existing manual review-and-handoff flow | Approved outbound provider, consent, templates, abuse limits, minors governance |

Cloudflare Realtime SFU/TURN can exceed its shared monthly free allowance, so do not create paid usage without budget approval. Paystack and peers require verified server-side transaction status and authenticated webhook validation; browser callbacks or user receipt images are not proof of payment.

## Acceptance
- Q16/Q35/Q36 static checks, migration hash manifest, TypeScript and production build must be green.
- Apply database migration to isolated development first and run permissions/denial checks.
- Production migration must precede frontend deployment.
- Verify mobile compact row, keyboard trap and restored focus across roles; open/close one existing and one new chat; confirm old thread is absent from New Chat even after refresh.
- Production Cloudflare Pages exact commit and Supabase applied migration must be inspected before declaring release complete.
