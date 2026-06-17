# Supabase Schema

This directory contains the database foundation for the World Cup match centre and prediction app.

## Files

- `schema.sql`: Current full schema snapshot.
- `migrations/20260617030000_initial_world_cup_schema.sql`: Initial migration for a new Supabase project.

## Remote Project

- Project ref: `iicrbyyagalnqzqppnox`
- Dashboard: https://supabase.com/dashboard/project/iicrbyyagalnqzqppnox
- Region: `ap-northeast-2`

## Access Model

- Public app clients can only read approved tables and views.
- No public `insert`, `update`, or `delete` policies are defined.
- Server-side ingestion/model jobs should write with a server-only key.
- Internal ingestion logs live in `app_private`, which is not exposed to `anon` or `authenticated`.

Never expose a service role key, database password, or direct connection string in browser code.

## Apply To Supabase

After creating a Supabase project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

If you prefer the dashboard first, paste `schema.sql` into the SQL editor and run it once against an empty project.

## Frontend Env

Use browser-safe keys only:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Keep server-only keys outside git:

```text
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```
