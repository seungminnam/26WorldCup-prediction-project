# Canonical Fixture Integrity Design

## Goal

Make the FIFA World Cup 2026 match schedule deterministic and prevent a live-score provider from changing fixed tournament metadata.

## Authority Boundaries

- FIFA's 10 April 2026 official 104-match schedule is authoritative for match number, stage, group, date, kickoff, venue, and group-stage participants.
- The same FIFA schedule is authoritative for knockout match slots, date, kickoff, and venue. Actual knockout team IDs remain null until progression is known.
- ESPN is authoritative only for live status, final scores, penalties, and scoring events.
- ESPN kickoff, venue, and participant values are diagnostic inputs. A mismatch produces a drift report and never overwrites canonical metadata.

## Data Model

Store all 104 matches in one canonical schedule module. Group fixtures have fixed team IDs. Knockout fixtures have fixed slot labels such as `2A` or `W73`, with nullable team IDs.

Add `home_slot` and `away_slot` to `public.fixtures` so unknown knockout participants can be displayed without fake team records. Expose these fields through `fixture_cards`.

The tournament simulation continues to consume only the 72 group fixtures. The match centre consumes the full 104-match schedule.

## Ingestion

The live-score plan may update only result-owned columns:

- `status`
- `home_goals`, `away_goals`
- `home_penalties`, `away_penalties`
- `winner_team_id`
- `result_verified_at`
- `source`, `source_url`

Scoring events remain idempotent through `(source, source_event_id)`. Before applying a result, the worker compares ESPN participants, kickoff, and venue with the canonical fixture. Any difference is returned and logged as drift; it is not written.

## Database Rollout

Generate `supabase/seed.sql` from the canonical schedule. Create a migration that:

1. adds knockout slot columns;
2. corrects all 72 group rows;
3. inserts matches 73-104;
4. preserves existing verified scores and ESPN scoring events;
5. updates `fixture_cards`.

Apply the migration to the linked project and verify row counts and all fixed fields against the canonical schedule.

## UI

Keep date grouping in `Asia/Seoul`. Show all 104 fixtures. For knockout matches without known teams, display the fixed FIFA slot labels. Forecast calculations continue to use group fixtures only.

## Verification

- Canonical schedule contains exactly 104 unique match numbers.
- Group stage contains 72 fixed participant pairs.
- Knockout stage contains 32 fixed slot pairs.
- All canonical timestamps and venues match the FIFA schedule snapshot.
- Result updates cannot contain fixed metadata columns.
- Drift comparison catches participant, kickoff, and venue differences.
- Linked Supabase contains 104 fixtures and retains all existing final scores and scoring events.
