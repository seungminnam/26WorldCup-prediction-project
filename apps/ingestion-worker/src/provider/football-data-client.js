const DEFAULT_BASE_URL = "https://api.football-data.org/v4";
const DEFAULT_COMPETITION_CODE = "WC";
const DEFAULT_TIMEOUT_MS = 20_000;

export function createFootballDataClient({
  apiToken,
  baseUrl = DEFAULT_BASE_URL,
  competitionCode = DEFAULT_COMPETITION_CODE,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!apiToken) {
    throw new Error("FOOTBALL_DATA_API_TOKEN is required");
  }

  async function request(pathSegment, searchParams = {}) {
    const url = new URL(`${baseUrl}${pathSegment}`);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, {
      headers: { "X-Auth-Token": apiToken },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`football-data.org request failed with status ${response.status}`);
    }

    return response.json();
  }

  return {
    fetchFixturesBetween({ dateFrom, dateTo }) {
      return request(`/competitions/${competitionCode}/matches`, { dateFrom, dateTo });
    }
  };
}
