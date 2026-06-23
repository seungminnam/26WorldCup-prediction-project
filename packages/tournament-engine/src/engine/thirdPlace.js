import { compareGroupStageRows } from "./ranking.js";

export function selectBestThirdPlaceTeams(groupRankings) {
  return groupRankings
    .map((ranking) => ranking[2])
    .filter(Boolean)
    .sort(compareGroupStageRows)
    .slice(0, 8);
}
