drop index public.match_events_source_event_dedupe_idx;

create unique index match_events_source_event_dedupe_idx
on public.match_events (source, source_event_id);
