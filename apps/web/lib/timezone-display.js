export function detectViewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatKickoffDateKey(kickoff, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(kickoff));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatKickoffShortDate(kickoff, timeZone) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(kickoff));
}

export function formatKickoffTime(kickoff, timeZone) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(kickoff));
}

export function getFixtureDateKeys(fixtures, timeZone) {
  return [...new Set(fixtures.map((fixture) => formatKickoffDateKey(fixture.kickoff, timeZone)))].sort();
}

export function hasFixtureDate(dateKeys, dateKey) {
  return dateKeys.includes(dateKey);
}

export function selectDefaultFixtureDate(fixtures, timeZone, now = new Date()) {
  const dateKeys = getFixtureDateKeys(fixtures, timeZone);
  const todayKey = formatKickoffDateKey(now, timeZone);

  if (hasFixtureDate(dateKeys, todayKey)) {
    return todayKey;
  }

  const nextFixture = fixtures
    .filter((fixture) => new Date(fixture.kickoff).getTime() >= now.getTime())
    .sort((left, right) => new Date(left.kickoff).getTime() - new Date(right.kickoff).getTime())[0];
  if (nextFixture) {
    return formatKickoffDateKey(nextFixture.kickoff, timeZone);
  }

  return dateKeys[0] ?? todayKey;
}
