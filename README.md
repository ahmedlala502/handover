# TryGC OS — Premium Handover Tool

Vercel-ready Next.js build that serves the standalone handover workspace with
cookie-session auth, admin user management, and per-user handover visibility.

## Local setup

```bash
npm install
$env:HANDOVER_ADMIN_USER="admin"
$env:HANDOVER_ADMIN_PASSWORD="change-me"
$env:HANDOVER_SESSION_SECRET="replace-with-a-long-random-secret"
npm run dev
```

Open `http://localhost:3000` and sign in with the configured admin credentials.
If `POSTGRES_URL` is present, the backend stores data in Supabase Postgres.
Without it, local development uses `.data/handover-db.json`.

## Deploy

```bash
cd trygc_handover_vercel
vercel env add HANDOVER_ADMIN_USER production
vercel env add HANDOVER_ADMIN_PASSWORD production
vercel env add HANDOVER_SESSION_SECRET production
vercel env add POSTGRES_URL production
npm run build
vercel deploy --prod
```

## What is included

- `public/handover.html` — optimized standalone app
- `app/api/auth/*` — login, logout, and session routes
- `app/api/app/state` — backend state loading/saving with visibility filtering
- `app/api/admin/users` — admin user CRUD, role updates, and password changes
- `app/route.ts` — root route serving the handover HTML
- `vercel.json` — production headers and clean URLs
- `manifest.webmanifest` — app metadata
- `package.json` — Vercel helper scripts

## Notes

Regular users only receive handovers where they are directly involved. Admins
can view all handovers or preview the filtered view for another user from
Settings.

Do not commit real Supabase credentials. Store them in `.env.local` locally and
Vercel environment variables in production.
