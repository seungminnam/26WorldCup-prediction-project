# Pre-Match Prediction Visibility Design

## Goal

Keep the MVP prediction honest by showing the rating/Poisson forecast only before kickoff, while live and completed fixtures focus on observed match data.

## Behavior

- `Upcoming`: show the pre-match W/D/L ribbon and likely scorelines; show `-` in score cells.
- `Live`: hide all prediction UI and show current numeric scores when available.
- `FT`: hide all prediction UI and show final numeric scores.
- `Result pending`: hide prediction UI and show the latest numeric scores while verification is pending.
- `Postponed`: hide prediction UI and show `-` in score cells.

The MVP will not fade probabilities as kickoff approaches and will not retain a pre-match snapshot on live or completed cards. In-play win probability remains a later, separately validated model.

## Structure

Add a small pure presentation module that owns the status rules. The match-centre component will call those helpers instead of embedding status comparisons in prediction and score rendering. Focused unit tests will lock down every supported status before the component changes.

## Verification

- Unit-test prediction visibility and score display for all five UI statuses.
- Run the full root suite, web typecheck, and production build.
- Verify in the browser that completed cards have no probability ribbon and upcoming cards still do.

