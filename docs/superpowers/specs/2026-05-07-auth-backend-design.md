# Auth Backend Design

## Goal

Replace the single Basic Auth gate and browser-only data model with a small backend that authenticates real users, filters handovers per user, and lets admins manage users from Settings.

## Design

The app keeps the existing static handover UI, but loads and saves data through Next.js route handlers. Sessions use signed HTTP-only cookies. Passwords are stored as `scrypt` hashes. The local persistence adapter writes a JSON database under `.data/handover-db.json`, or `HANDOVER_DATA_FILE` when set.

Regular users receive only handovers where they are creator, sender, receiver, task owner, or blocker owner. Admins receive all data and can pass a preview user id to receive the same filtered view that user would see. Admin user management can create, update, delete, change passwords, and update access roles. Password hashes are never sent to the browser.

## Notes

The JSON store is suitable for local use and single-instance demos. On Vercel production, it should be replaced with Supabase/Postgres because serverless file writes are not durable.
