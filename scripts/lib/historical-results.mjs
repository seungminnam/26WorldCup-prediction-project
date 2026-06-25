export const TEAM_NAME_TO_ID = new Map([
  ["Mexico", "MEX"],
  ["South Africa", "RSA"],
  ["South Korea", "KOR"],
  ["Czech Republic", "CZE"],
  ["Canada", "CAN"],
  ["Bosnia and Herzegovina", "BIH"],
  ["Qatar", "QAT"],
  ["Switzerland", "SUI"],
  ["Haiti", "HAI"],
  ["Scotland", "SCO"],
  ["Brazil", "BRA"],
  ["Morocco", "MAR"],
  ["United States", "USA"],
  ["Paraguay", "PAR"],
  ["Australia", "AUS"],
  ["Turkey", "TUR"],
  ["Ivory Coast", "CIV"],
  ["Ecuador", "ECU"],
  ["Germany", "GER"],
  ["Curaçao", "CUW"],
  ["Netherlands", "NED"],
  ["Japan", "JPN"],
  ["Sweden", "SWE"],
  ["Tunisia", "TUN"],
  ["Iran", "IRN"],
  ["New Zealand", "NZL"],
  ["Belgium", "BEL"],
  ["Egypt", "EGY"],
  ["Saudi Arabia", "KSA"],
  ["Uruguay", "URU"],
  ["Spain", "ESP"],
  ["Cape Verde", "CPV"],
  ["France", "FRA"],
  ["Senegal", "SEN"],
  ["Iraq", "IRQ"],
  ["Norway", "NOR"],
  ["Argentina", "ARG"],
  ["Algeria", "ALG"],
  ["Austria", "AUT"],
  ["Jordan", "JOR"],
  ["Portugal", "POR"],
  ["DR Congo", "COD"],
  ["Uzbekistan", "UZB"],
  ["Colombia", "COL"],
  ["Ghana", "GHA"],
  ["Panama", "PAN"],
  ["England", "ENG"],
  ["Croatia", "CRO"]
]);

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function loadCompetitiveMatches(csvText, { excludeUpcomingWorldCup = true } = {}) {
  const lines = csvText.trim().split("\n");
  const matches = [];

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [date, homeTeam, awayTeam, homeScore, awayScore, tournament, , , neutral] = parseCsvLine(line);

    if (tournament === "Friendly") continue;
    if (excludeUpcomingWorldCup && tournament === "FIFA World Cup" && date >= "2026-01-01") continue;
    if (homeScore === "NA" || awayScore === "NA") continue;

    if (!homeTeam || !awayTeam) continue;
    const homeTeamId = TEAM_NAME_TO_ID.get(homeTeam) ?? homeTeam;
    const awayTeamId = TEAM_NAME_TO_ID.get(awayTeam) ?? awayTeam;

    matches.push({
      date: new Date(date),
      homeTeamId,
      awayTeamId,
      homeGoals: Number(homeScore),
      awayGoals: Number(awayScore),
      isNeutralVenue: neutral.trim() === "TRUE"
    });
  }

  return matches;
}
