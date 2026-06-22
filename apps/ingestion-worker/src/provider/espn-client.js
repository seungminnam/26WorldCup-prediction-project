const DEFAULT_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const DEFAULT_TIMEOUT_MS = 20_000;

export function createEspnClient({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  async function request(pathSegment, searchParams = {}) {
    const url = new URL(`${baseUrl}/${pathSegment}`);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!response.ok) {
      throw new Error(`ESPN request failed with status ${response.status}`);
    }

    return response.json();
  }

  return {
    fetchFixturesBetween({ dateFrom, dateTo }) {
      return request("scoreboard", {
        dates: `${compactDate(dateFrom)}-${compactDate(dateTo)}`,
        limit: 200
      });
    },

    fetchTeams() {
      return request("teams", { limit: 60 });
    },

    async fetchTournamentEvents() {
      const payload = await request("scoreboard", {
        dates: "20260611-20260719",
        limit: 200
      });
      return Array.isArray(payload.events) ? payload.events : [];
    }
  };
}

function compactDate(isoDate) {
  return isoDate.replaceAll("-", "");
}
