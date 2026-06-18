const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_LEAGUE_ID = 1;
const DEFAULT_SEASON = 2026;
const DEFAULT_TIMEOUT_MS = 20_000;

export function createApiFootballClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  leagueId = DEFAULT_LEAGUE_ID,
  season = DEFAULT_SEASON,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!apiKey) {
    throw new Error("API_FOOTBALL_API_KEY is required");
  }

  async function request(searchParams) {
    const url = new URL("/fixtures", baseUrl);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, {
      headers: {
        "x-apisports-key": apiKey
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`API-Football request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.errors && Object.keys(payload.errors).length > 0) {
      throw new Error("API-Football returned provider errors");
    }

    return {
      payload,
      rateLimit: readRateLimit(response.headers)
    };
  }

  return {
    fetchFixturesBetween({ dateFrom, dateTo }) {
      return request({
        league: leagueId,
        season,
        from: dateFrom,
        to: dateTo,
        timezone: "UTC"
      });
    },

    fetchLiveFixtures() {
      return request({ live: leagueId });
    }
  };
}

function readRateLimit(headers) {
  return {
    limit: optionalNumber(headers?.get("x-ratelimit-requests-limit")),
    remaining: optionalNumber(headers?.get("x-ratelimit-requests-remaining")),
    resetAt: optionalNumber(headers?.get("x-ratelimit-requests-reset"))
  };
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
