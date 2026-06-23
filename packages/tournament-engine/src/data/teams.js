export const teams = [
  { id: "MEX", name: "Mexico", group: "A", rating: 1715, fifaRanking: 14 },
  { id: "RSA", name: "South Africa", group: "A", rating: 1530, fifaRanking: 60 },
  { id: "KOR", name: "Korea Republic", group: "A", rating: 1660, fifaRanking: 25 },
  { id: "CZE", name: "Czechia", group: "A", rating: 1645, fifaRanking: 40 },
  { id: "CAN", name: "Canada", group: "B", rating: 1625, fifaRanking: 30 },
  { id: "BIH", name: "Bosnia and Herzegovina", group: "B", rating: 1570, fifaRanking: 64 },
  { id: "QAT", name: "Qatar", group: "B", rating: 1485, fifaRanking: 56 },
  { id: "SUI", name: "Switzerland", group: "B", rating: 1720, fifaRanking: 19 },
  { id: "HAI", name: "Haiti", group: "C", rating: 1420, fifaRanking: 83 },
  { id: "SCO", name: "Scotland", group: "C", rating: 1600, fifaRanking: 42 },
  { id: "BRA", name: "Brazil", group: "C", rating: 1860, fifaRanking: 6 },
  { id: "MAR", name: "Morocco", group: "C", rating: 1740, fifaRanking: 7 },
  { id: "USA", name: "United States", group: "D", rating: 1690, fifaRanking: 17 },
  { id: "PAR", name: "Paraguay", group: "D", rating: 1610, fifaRanking: 41 },
  { id: "AUS", name: "Australia", group: "D", rating: 1585, fifaRanking: 27 },
  { id: "TUR", name: "Turkiye", group: "D", rating: 1700, fifaRanking: 22 },
  { id: "CIV", name: "Cote d'Ivoire", group: "E", rating: 1605, fifaRanking: 33 },
  { id: "ECU", name: "Ecuador", group: "E", rating: 1718, fifaRanking: 23 },
  { id: "GER", name: "Germany", group: "E", rating: 1810, fifaRanking: 10 },
  { id: "CUW", name: "Curacao", group: "E", rating: 1435, fifaRanking: 82 },
  { id: "NED", name: "Netherlands", group: "F", rating: 1815, fifaRanking: 8 },
  { id: "JPN", name: "Japan", group: "F", rating: 1710, fifaRanking: 18 },
  { id: "SWE", name: "Sweden", group: "F", rating: 1635, fifaRanking: 38 },
  { id: "TUN", name: "Tunisia", group: "F", rating: 1560, fifaRanking: 45 },
  { id: "IRN", name: "IR Iran", group: "G", rating: 1595, fifaRanking: 20 },
  { id: "NZL", name: "New Zealand", group: "G", rating: 1450, fifaRanking: 85 },
  { id: "BEL", name: "Belgium", group: "G", rating: 1790, fifaRanking: 9 },
  { id: "EGY", name: "Egypt", group: "G", rating: 1630, fifaRanking: 29 },
  { id: "KSA", name: "Saudi Arabia", group: "H", rating: 1515, fifaRanking: 61 },
  { id: "URU", name: "Uruguay", group: "H", rating: 1780, fifaRanking: 16 },
  { id: "ESP", name: "Spain", group: "H", rating: 1865, fifaRanking: 2 },
  { id: "CPV", name: "Cabo Verde", group: "H", rating: 1495, fifaRanking: 67 },
  { id: "FRA", name: "France", group: "I", rating: 1855, fifaRanking: 3 },
  { id: "SEN", name: "Senegal", group: "I", rating: 1685, fifaRanking: 15 },
  { id: "IRQ", name: "Iraq", group: "I", rating: 1535, fifaRanking: 57 },
  { id: "NOR", name: "Norway", group: "I", rating: 1680, fifaRanking: 31 },
  { id: "ARG", name: "Argentina", group: "J", rating: 1870, fifaRanking: 1 },
  { id: "ALG", name: "Algeria", group: "J", rating: 1608, fifaRanking: 28 },
  { id: "AUT", name: "Austria", group: "J", rating: 1735, fifaRanking: 24 },
  { id: "JOR", name: "Jordan", group: "J", rating: 1460, fifaRanking: 63 },
  { id: "POR", name: "Portugal", group: "K", rating: 1835, fifaRanking: 5 },
  { id: "COD", name: "Congo DR", group: "K", rating: 1545, fifaRanking: 46 },
  { id: "UZB", name: "Uzbekistan", group: "K", rating: 1525, fifaRanking: 50 },
  { id: "COL", name: "Colombia", group: "K", rating: 1760, fifaRanking: 13 },
  { id: "GHA", name: "Ghana", group: "L", rating: 1575, fifaRanking: 73 },
  { id: "PAN", name: "Panama", group: "L", rating: 1500, fifaRanking: 34 },
  { id: "ENG", name: "England", group: "L", rating: 1840, fifaRanking: 4 },
  { id: "CRO", name: "Croatia", group: "L", rating: 1755, fifaRanking: 11 }
];

export const groupLabels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function teamsByGroup(teamList = teams) {
  return groupLabels.map((group) => ({
    group,
    teams: teamList.filter((team) => team.group === group)
  }));
}
