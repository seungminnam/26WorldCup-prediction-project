export const LIVE_REFRESH_INTERVAL_MS = 60_000;

export function shouldRefreshLiveData({
  dataSource,
  visibilityState
}: {
  dataSource: "supabase" | "seed";
  visibilityState: DocumentVisibilityState;
}) {
  return dataSource === "supabase" && visibilityState === "visible";
}

export function shouldShowDataLoadedAt({
  fetchedAt,
  viewerTimeZoneDetected
}: {
  fetchedAt: string | undefined;
  viewerTimeZoneDetected: boolean;
}) {
  return Boolean(fetchedAt && viewerTimeZoneDetected);
}

export function formatDataLoadedAt(isoTimestamp: string | undefined, timeZone: string) {
  if (!isoTimestamp) return "";

  const loadedAt = new Date(isoTimestamp);
  if (Number.isNaN(loadedAt.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "shortOffset"
  }).format(loadedAt);
}
