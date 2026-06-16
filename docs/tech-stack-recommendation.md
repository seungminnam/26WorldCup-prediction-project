# Tech Stack Recommendation

## Recommendation

Use Next.js on Vercel for the web app, Supabase Postgres for persisted match/model data, and a separate Python training pipeline for model development.

## Why This Stack

- **Next.js + Vercel**: best fit for a polished dynamic sports site with routing, server-rendered pages, interactive client components, and simple deployment.
- **Supabase Postgres**: good fit for fixtures, teams, match events, model runs, cached probabilities, and admin-edited locked results.
- **Python training pipeline**: better fit than JavaScript for modeling, feature engineering, backtesting, and evaluation.
- **TypeScript simulation engine**: keeps the tournament rules and web-facing simulation logic close to the UI.

## Proposed Architecture

- `Next.js app`
  - Match centre pages
  - Team pages
  - Bracket page
  - Forecast UI
  - Admin/result editor later
- `Supabase`
  - teams
  - fixtures
  - match_events
  - team_ratings
  - model_versions
  - simulation_runs
  - forecast_snapshots
- `Python model jobs`
  - train model locally or in scheduled jobs
  - export ratings/probabilities
  - write model outputs to Supabase
- `TypeScript engine`
  - group ranking
  - best-third selection
  - bracket construction
  - Monte Carlo forecast

## What Not To Use As The Main App

Streamlit is useful for model notebooks and internal exploration, but it should not be the main public product. The project needs a sports-site feel, rich routing, polished bracket UI, and production deployment. Next.js is the stronger primary app choice.

## Deployment Path

1. Keep the current static MVP until the product shape is stable.
2. Migrate UI to Next.js App Router.
3. Add Supabase schema and seed data.
4. Add an admin-only result update flow.
5. Add Python training outputs and forecast snapshots.
6. Deploy to Vercel.
