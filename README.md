# ASA TUK website

The public website and its council tools are hosted as static pages, with Supabase providing authentication, database, storage, and row-level permissions.

## Main pages

- `index.html` — public ASA TUK website.
- `shop.html` — public online shop. Prices are displayed in Kenyan shillings (KSh).
- `admin.html` — main content and membership administration.
- `merchandise-admin.html` — merchandise listings, stock, orders, and finance-gated payment verification.
- `council-hub.html` — council meetings, minutes, and action tracker.
- `council-access.html` — administrator-only council role assignments.

## Supabase

The browser-safe project configuration is in `assets/admin-config.js`. It must contain only the project URL and publishable key; never commit a service-role or secret key.

Migrations for the council and merchandise features are stored in `supabase/migrations/` and use the same timestamps as the applied migrations in the connected Supabase project. Apply them in timestamp order to a new project after the earlier ASA TUK admin, membership, timetable, student-resource, and project-submission migrations are available.

- `20261016103940_council_merchandise_shop_foundation.sql`
- `20261016104002_protect_merchandise_payment_verification.sql`
- `20261016104344_scope_council_task_permissions.sql`
- `20261016110929_secure_merchandise_checkout_and_indexes.sql`

Public checkout intentionally calls a narrowly validated database function so inventory changes happen atomically and client-submitted prices are never trusted. The function records a payment reference but does not mark payment as verified. Only the administrator or an assigned finance officer may verify payments.

## Initial setup after deployment

1. Sign in with an existing authorised Supabase Auth account.
2. In `council-access.html`, an administrator assigns each council member using the person's Supabase Auth user UUID and minimum required permissions.
3. Assign the Merchandise Officer and assistant merchandise staff `can_manage_merchandise`; assign the Treasurer/authorised finance officer `can_manage_finance`. Do not give payment verification to merchandise-only staff.
4. Create and publish product listings in `merchandise-admin.html`. Confirm the public listing appears in `shop.html`.
5. Test checkout with a low-risk test product, confirm the order appears in the dashboard, and verify stock decrements exactly once.
6. Confirm the live hosting provider has completed its deployment and test the public pages on desktop and mobile.

## Verification status

The relevant HTML/JavaScript files and migration SQL were checked for syntax-level issues during implementation. The Supabase schema and migration history were inspected. A full browser-based end-to-end checkout and visual regression test still needs to be performed against the deployed hosting environment; do not treat a GitHub commit alone as proof of a successful production deployment.
