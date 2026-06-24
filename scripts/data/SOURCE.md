# Historical Results Data Source

- Source: https://github.com/martj42/international_results
- File: `results.csv` from the `master` branch
- License: CC0-1.0 (Creative Commons Zero, public domain) — confirmed via the repo's `LICENSE` file and GitHub API license metadata
- Fetched: 2026-06-24
- Columns: `date, home_team, away_team, home_score, away_score, tournament, city, country, neutral`
- Coverage: international football results from 1872 to the present, including the in-progress 2026 FIFA World Cup (with `NA` scores for unplayed matches) — training explicitly excludes every row tagged `tournament == "FIFA World Cup"` dated 2026 or later (the tournament this model exists to predict, including its 48 already-played group matches present in the dataset). Other 2026 competitions (e.g. the 2026 Africa Cup of Nations) are *not* excluded — they're real, fully-resolved results from a different competition, exactly the kind of recent signal the time-decay weighting is meant to favor. See `scripts/lib/historical-results.mjs`.
