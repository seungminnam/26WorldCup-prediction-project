export const DEFAULT_LIVE_SYNC_BEFORE_MS = 30 * 60 * 1000;
export const DEFAULT_LIVE_SYNC_AFTER_MS = 3 * 60 * 60 * 1000;

type FixtureLike = {
  id: string | number;
  matchNumber?: string | number;
  kickoff: string;
};

type LiveSyncOptions = {
  beforeMs?: number;
  afterMs?: number;
};

type SyncWindow = {
  activeFixtureIds: string[];
  nextWindow: {
    fixtureId: string;
    matchNumber?: string | number;
    kickoff: string;
    startsAt: string;
    endsAt: string;
  } | null;
};

export function shouldRunLiveSync(
  fixtures: FixtureLike[],
  now: Date = new Date(),
  options: LiveSyncOptions = {}
) {
  return findLiveSyncWindow(fixtures, now, options).activeFixtureIds.length > 0;
}

export function findLiveSyncWindow(
  fixtures: FixtureLike[],
  now: Date = new Date(),
  options: LiveSyncOptions = {}
): SyncWindow {
  const beforeMs = options.beforeMs ?? DEFAULT_LIVE_SYNC_BEFORE_MS;
  const afterMs = options.afterMs ?? DEFAULT_LIVE_SYNC_AFTER_MS;
  const nowMs = now.getTime();

  const windows = fixtures
    .map((fixture) => buildFixtureWindow(fixture, beforeMs, afterMs))
    .filter((window) => window !== null)
    .sort((left, right) => left.startsAtMs - right.startsAtMs);

  const activeFixtureIds = windows
    .filter((window) => window.startsAtMs <= nowMs && nowMs <= window.endsAtMs)
    .map((window) => String(window.fixture.id));

  const nextWindow = activeFixtureIds.length > 0
    ? null
    : windows.find((window) => window.startsAtMs > nowMs) ?? null;

  return {
    activeFixtureIds,
    nextWindow: nextWindow ? serializeWindow(nextWindow) : null
  };
}

function buildFixtureWindow(fixture: FixtureLike, beforeMs: number, afterMs: number) {
  const kickoffMs = new Date(fixture.kickoff).getTime();

  if (!Number.isFinite(kickoffMs)) {
    return null;
  }

  return {
    fixture,
    kickoffMs,
    startsAtMs: kickoffMs - beforeMs,
    endsAtMs: kickoffMs + afterMs
  };
}

function serializeWindow(window: NonNullable<ReturnType<typeof buildFixtureWindow>>) {
  return {
    fixtureId: String(window.fixture.id),
    matchNumber: window.fixture.matchNumber,
    kickoff: new Date(window.kickoffMs).toISOString(),
    startsAt: new Date(window.startsAtMs).toISOString(),
    endsAt: new Date(window.endsAtMs).toISOString()
  };
}
