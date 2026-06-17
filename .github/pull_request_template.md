## Summary

-

## Test Plan

- [ ] `npm test`
- [ ] `npm run ingestion:test`
- [ ] `npm run typecheck --workspace apps/web`
- [ ] `npm run build --workspace apps/web`
- [ ] Secret scan completed when relevant

## Security Notes

- [ ] No secrets, tokens, DB URLs, service role keys, or provider credentials committed
- [ ] Supabase RLS/view rules reviewed when database objects changed
- [ ] Provider payloads are sanitized if sample data was added

## Deployment Notes

- Vercel preview:
- Supabase migration required: yes/no
- Production data write required: yes/no
