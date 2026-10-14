# ASA TUK integration notes

The dashboard content is stored in Supabase. The site loader appended to `assets/site.js` automatically loads the public-content integration on `events.html` and `news.html`, and the membership integration on `join.html`. Static existing content is retained as a fallback. Membership applications are stored in `public.members`; public visitors can submit applications but cannot read them. Only authenticated users with the `admin` role can review them.

The database migrations for the content dashboard and membership table have already been applied to the connected Supabase project. Do not rerun them on production. See `ADMIN-SETUP.md` to authorise the first administrator.
