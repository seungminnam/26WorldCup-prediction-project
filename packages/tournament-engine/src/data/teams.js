export const teams = [
  { id: "MEX", name: "Mexico", group: "A", rating: 1715 },
  { id: "RSA", name: "South Africa", group: "A", rating: 1530 },
  { id: "KOR", name: "Korea Republic", group: "A", rating: 1660 },
  { id: "CZE", name: "Czechia", group: "A", rating: 1645 },
  { id: "CAN", name: "Canada", group: "B", rating: 1625 },
  { id: "BIH", name: "Bosnia and Herzegovina", group: "B", rating: 1570 },
  { id: "QAT", name: "Qatar", group: "B", rating: 1485 },
  { id: "SUI", name: "Switzerland", group: "B", rating: 1720 },
  { id: "HAI", name: "Haiti", group: "C", rating: 1420 },
  { id: "SCO", name: "Scotland", group: "C", rating: 1600 },
  { id: "BRA", name: "Brazil", group: "C", rating: 1860 },
  { id: "MAR", name: "Morocco", group: "C", rating: 1740 },
  { id: "USA", name: "United States", group: "D", rating: 1690 },
  { id: "PAR", name: "Paraguay", group: "D", rating: 1610 },
  { id: "AUS", name: "Australia", group: "D", rating: 1585 },
  { id: "TUR", name: "Turkiye", group: "D", rating: 1700 },
  { id: "CIV", name: "Cote d'Ivoire", group: "E", rating: 1605 },
  { id: "ECU", name: "Ecuador", group: "E", rating: 1718 },
  { id: "GER", name: "Germany", group: "E", rating: 1810 },
  { id: "CUW", name: "Curacao", group: "E", rating: 1435 },
  { id: "NED", name: "Netherlands", group: "F", rating: 1815 },
  { id: "JPN", name: "Japan", group: "F", rating: 1710 },
  { id: "SWE", name: "Sweden", group: "F", rating: 1635 },
  { id: "TUN", name: "Tunisia", group: "F", rating: 1560 },
  { id: "IRN", name: "IR Iran", group: "G", rating: 1595 },
  { id: "NZL", name: "New Zealand", group: "G", rating: 1450 },
  { id: "BEL", name: "Belgium", group: "G", rating: 1790 },
  { id: "EGY", name: "Egypt", group: "G", rating: 1630 },
  { id: "KSA", name: "Saudi Arabia", group: "H", rating: 1515 },
  { id: "URU", name: "Uruguay", group: "H", rating: 1780 },
  { id: "ESP", name: "Spain", group: "H", rating: 1865 },
  { id: "CPV", name: "Cabo Verde", group: "H", rating: 1495 },
  { id: "FRA", name: "France", group: "I", rating: 1855 },
  { id: "SEN", name: "Senegal", group: "I", rating: 1685 },
  { id: "IRQ", name: "Iraq", group: "I", rating: 1535 },
  { id: "NOR", name: "Norway", group: "I", rating: 1680 },
  { id: "ARG", name: "Argentina", group: "J", rating: 1870 },
  { id: "ALG", name: "Algeria", group: "J", rating: 1608 },
  { id: "AUT", name: "Austria", group: "J", rating: 1735 },
  { id: "JOR", name: "Jordan", group: "J", rating: 1460 },
  { id: "POR", name: "Portugal", group: "K", rating: 1835 },
  { id: "COD", name: "Congo DR", group: "K", rating: 1545 },
  { id: "UZB", name: "Uzbekistan", group: "K", rating: 1525 },
  { id: "COL", name: "Colombia", group: "K", rating: 1760 },
  { id: "GHA", name: "Ghana", group: "L", rating: 1575 },
  { id: "PAN", name: "Panama", group: "L", rating: 1500 },
  { id: "ENG", name: "England", group: "L", rating: 1840 },
  { id: "CRO", name: "Croatia", group: "L", rating: 1755 }
];

export const groupLabels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function teamsByGroup(teamList = teams) {
  return groupLabels.map((group) => ({
    group,
    teams: teamList.filter((team) => team.group === group)
  }));
}
