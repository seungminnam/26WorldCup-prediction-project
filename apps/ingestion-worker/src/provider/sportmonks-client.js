const DEFAULT_BASE_URL = "https://api.sportmonks.com";
const DEFAULT_FIXTURE_INCLUDES = "participants;league;season;venue;state";
const DEFAULT_TIMEOUT_MS = 20_000;

export function createSportmonksClient({
  token,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!token) {
    throw new Error("SPORTMONKS_API_TOKEN is required");
  }

  return {
    async fetchFixturesBetween({ dateFrom, dateTo }) {
      const url = new URL(
        `/v3/football/fixtures/between/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}`,
        baseUrl
      );
      url.searchParams.set("api_token", token);
      url.searchParams.set("include", DEFAULT_FIXTURE_INCLUDES);

      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        throw new Error(`Sportmonks request failed with status ${response.status}`);
      }

      return response.json();
    }
  };
}
