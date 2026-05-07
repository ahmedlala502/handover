# TryGC OS — Premium Handover Tool

Vercel-ready Next.js build that serves the standalone handover workspace behind
edge Basic Auth.

## Local setup

```bash
npm install
$env:HANDOVER_AUTH_USER="ops"
$env:HANDOVER_AUTH_PASSWORD="change-me"
npm run dev
```

Open `http://localhost:3000` and sign in with the configured credentials.

## Deploy

```bash
cd trygc_handover_vercel
vercel env add HANDOVER_AUTH_USER production
vercel env add HANDOVER_AUTH_PASSWORD production
npm run build
vercel deploy --prod
```

## What is included

- `public/handover.html` — optimized standalone app
- `proxy.ts` — edge Basic Auth protection
- `app/route.ts` — root route serving the handover HTML
- `vercel.json` — production headers and clean URLs
- `manifest.webmanifest` — app metadata
- `package.json` — Vercel helper scripts

## Notes

This version stores data locally in the browser using localStorage. For real
multi-user sync, connect the app to Supabase Auth + Realtime DB.
