# World Cup 2026 Match Centre PRD

## 1. Product Summary

Build a polished World Cup 2026 match centre that combines official-style tournament information with an interactive forecasting layer. The product should feel like a sports site first and a prediction product second: users arrive to check fixtures, results, standings, and bracket paths, then discover forecasts naturally when they want to explore what might happen next.

## 2. Target Users

- Football fans tracking match results, scorers, group tables, and knockout paths.
- Data-minded fans who want qualification and title probabilities.
- Recruiters or portfolio reviewers evaluating product engineering, data modeling, and UI craft.

## 3. Core User Stories

- As a fan, I can see past match results, goalscorers, venues, and kickoff times.
- As a fan, I can see upcoming fixtures by date.
- As a fan, I can see current group standings with points, goal difference, and goals.
- As a fan, I can inspect a projected knockout bracket with scores.
- As an analyst-minded user, I can run a forecast and view team probabilities.
- As a portfolio reviewer, I can understand that the project includes tournament rules, simulation, UI, and model architecture.

## 4. MVP Navigation

Use primary tabs rather than a long scroll page:

- **Fixtures**: scores, goalscorers, venues, kickoff times, date filter.
- **Standings**: current group tables from completed results; projected group tables from the latest forecast.
- **Bracket**: projected knockout bracket from the latest simulation.
- **Forecast**: simulation controls, title favorites, team probability table, selected-team detail.

## 5. Functional Requirements

### Fixtures

- Show completed matches with score and goalscorers.
- Show upcoming matches with venue and kickoff time.
- Provide date chips for quick day switching.

### Standings

- Show all 12 groups.
- Current standings must use only completed matches.
- Projected standings must use the latest sample simulation.
- Table columns: position, team, played, points, goal difference, goals for.

### Bracket

- Show Round of 32 through Final.
- Display sample simulated scores.
- Place later-round matches between the source matches they depend on.
- Keep horizontal scrolling inside the bracket area only.

### Forecast

- Let the user choose simulation count and snapshot/pre-tournament mode.
- Show champion odds cards.
- Show a sortable-style probability table, initially sorted by champion probability.
- Show selected-team drill-down.

## 6. Non-Goals For Current MVP

- Live FIFA data ingestion.
- User accounts.
- Admin CMS.
- Official FIFA branding assets.
- Fully compliant FIFA Annex C lookup table.
- Production-trained model.

## 7. Recommended Tech Stack

- **Frontend**: Next.js App Router, TypeScript, Vercel.
- **Database**: Supabase Postgres for teams, fixtures, match events, ratings, model versions, simulation snapshots.
- **Modeling**: Python pipeline for training, backtesting, and feature engineering.
- **Simulation**: TypeScript tournament engine shared by the web app.

## 8. Data Model Direction

- `teams`
- `fixtures`
- `match_events`
- `group_standings_snapshots`
- `team_ratings`
- `model_versions`
- `forecast_runs`
- `forecast_probabilities`
- `bracket_snapshots`

## 9. Success Criteria

- A user can understand the current tournament state without running the model.
- A user can run forecasts without leaving the match-centre flow.
- The bracket looks like a tournament tree, not a flat list.
- The app has a clear path to production deployment on Vercel with Supabase.
