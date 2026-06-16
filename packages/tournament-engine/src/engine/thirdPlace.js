import { compareRows } from "./ranking.js";

export function selectBestThirdPlaceTeams(groupRankings) {
  return groupRankings
    .map((ranking) => ranking[2])
    .filter(Boolean)
    .sort(compareRows)
    .slice(0, 8);
}
