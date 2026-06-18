export function detectViewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatKickoffDateKey(kickoff) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(kickoff));
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
