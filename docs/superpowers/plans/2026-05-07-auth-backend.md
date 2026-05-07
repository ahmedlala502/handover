# Auth Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real users, sessions, per-user handover visibility, admin preview, and Settings user management.

**Architecture:** Server code owns authentication, persistence, and authorization. The existing static UI becomes an API client and no longer trusts localStorage for operational data.

**Tech Stack:** Next.js App Router route handlers, Node `crypto` scrypt/HMAC, JSON file storage, Vitest.

---

### Task 1: Server Auth And Store

**Files:**
- Create: `src/server/auth.ts`
- Create: `src/server/handover-store.ts`
- Test: `tests/server-auth.test.ts`

- [x] Write failing tests for password hashing, signed cookies, visibility, and admin user management.
- [x] Run `npm test -- tests/server-auth.test.ts` and verify missing modules fail.
- [ ] Implement minimal server modules to satisfy the tests.
- [ ] Run `npm test -- tests/server-auth.test.ts` and verify pass.

### Task 2: API Routes

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/session/route.ts`
- Create: `app/api/app/state/route.ts`
- Create: `app/api/admin/users/route.ts`
- Modify: `proxy.ts`

- [ ] Add session endpoints for login/logout/current user.
- [ ] Add state GET/PUT endpoints that use server-side visibility.
- [ ] Add admin users endpoint.
- [ ] Remove Basic Auth enforcement from `proxy.ts` so the UI can render a login screen.

### Task 3: UI Adapter

**Files:**
- Modify: `public/handover.html`
- Modify: `README.md`

- [ ] Add a login screen.
- [ ] Load state from `/api/app/state`.
- [ ] Save state to `/api/app/state`.
- [ ] Use Settings/admin user modal for username, access role, and password changes.
- [ ] Add admin preview controls.
- [ ] Document local admin credentials and persistence caveat.

### Task 4: Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --stat`.
