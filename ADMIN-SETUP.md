# ASA TUK Admin Setup

## Deployment
1. Keep the dashboard files at the site root and the JavaScript/CSS files in `assets/`.
2. Netlify can deploy this static site without a build command.
3. The connected Supabase project already has the `admin_users`, `events`, `announcements`, `opportunities`, and `members` tables and RLS policies. Do not rerun the migrations on production.

## Create the first administrator
1. In Supabase Dashboard, open Authentication → Users and create the administrator account with a verified email.
2. Copy that user's UUID.
3. In SQL Editor, run this with the real UUID and display name:

```sql
insert into public.admin_users (user_id, display_name, role)
values ('REPLACE-WITH-AUTH-USER-UUID', 'ASA TUK Administrator', 'admin');
```

Never expose a service-role key in browser code. The public URL and publishable key in `assets/admin-config.js` are intended for browser use; RLS controls access.

## Test after deploy
- Sign in at `/admin.html`.
- Submit a test application from `/join.html`; verify it appears in Membership applications.
- Publish a test event and announcement; verify they appear on `/events.html` and `/news.html`.
- Remove test records when finished.

Membership confirmation is shown on the page. Formspree is used separately for committee email notification; an automatic email to the applicant requires a configured autoresponder/provider.
