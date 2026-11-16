# Q37 — Global private DLI direct calling

## Why Q35 calls did not ring reliably
Previous implementation required both participants to have the **identical open chat** and an active per-thread Presence connection. Call buttons were disabled when the peer opened another screen. The call modal was owned by Messages and unmounted during navigation, terminating media.

## Changes
- A persistent `CallProvider` receives an incoming voice/video offer in a **per-authenticated-user private Supabase Realtime inbox** across all DLI dashboards and pages while the website is open.
- New restricted `dli_call_signal` RPC validates the real Auth user, target, existing direct thread, current active roles and permitted role-to-role contact; it forwards ephemeral offer/answer/ICE/hangup signals as private database Broadcast events. Clients cannot join another person's inbox.
- Database rate-limits offers; rejects malformed descriptions and excessive payloads. Does **not** permit anonymous access, student-peer calls, phone-network/PSTN calls, public media broadcasting or server-side recording.
- The existing `useDirectPeerCall` establishes browser WebRTC media only with the user's microphone/camera consent. Adds safe ordering for early ICE, a 45-second unanswered-call timeout, Cloudflare's public STUN address and explicit screen-share track restoration.
- Existing messages, role restrictions, lesson storage, manual finance and database history are not changed.
- Calls work only while both DLI web sessions are open and connected. No closed-browser push notifications are implied.

## Outstanding production dependencies
- **TURN** relay: needed for reliable peer-to-peer connections on mobile-carrier NATs and restrictive/firewalled networks. Cloudflare's TURN/SFU requires provisioning; costs may accrue. No fee-bearing key was created.
- **Group conferences** remain governance/chat only until an SFU is provisioned and participant tokens are issued securely. Do not claim that group audio/video streams work.
- Real authenticated device-to-device testing needs two consenting DLI accounts; static CI and SQL ACL checks alone cannot prove camera/microphone/ICE connectivity.

## Release requirements
1. Confirm TypeScript + Q16/Q35/Q36/Q37 source checks and migration integrity.
2. Apply migration on development Supabase first. Verify anonymous denial, authenticated permission and unrelated recipients denied. No student records or fake recipients may be created.
3. Apply identical reviewed migration to production before merging.
4. Merge exact passing SHA to Cloudflare production branch and verify canonical deployment commit and success.
5. Real-device acceptance: Owner↔Student call with both browsing different pages, Admin↔Assistant Admin video, denied Student↔Student, declined/unanswered call, microphone/camera permission denial, mobile screen-share availability, browser-close behavior and restrictive-NAT fallback.

## Browser constraints
This feature is an **in-app voice/video call**, not a cellular telephone/PSTN dialer. Camera/microphone API requires HTTPS and individual browser consent. No recording is enabled by default.
