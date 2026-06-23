import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareFixedFixtureMetadata,
  normalizeEspnFixture,
  normalizeEspnPayload,
  normalizeEspnTeams,
  normalizeEspnStatus
} from "../src/provider/espn.js";

async function loadFixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

test("normalizes a finished ESPN fixture with goal events", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnFixture(raw.events[0]);

  assert.deepEqual(result, {
    provider: "espn",
    providerFixtureId: "760415",
    providerLeagueId: "fifa.world",
    providerSeasonId: "2026",
    kickoffAt: "2026-06-11T19:00Z",
    venue: { providerVenueId: "1672", name: "Estadio Banorte" },
    venueName: "Estadio Banorte",
    venueCity: "Mexico City",
    round: "FIFA World Cup, Group A",
    elapsed: 90,
    status: "final",
    home: { providerTeamId: "203", name: "Mexico", code: "MEX", goals: 2, penalties: null },
    away: { providerTeamId: "774", name: "South Africa", code: "RSA", goals: 0, penalties: null },
    events: [
      {
        providerEventId: "760415:203:513:70:233075",
        providerTeamId: "203",
        playerName: "Julián Quiñones",
        assistPlayerName: null,
        minute: 9,
        stoppageMinute: null,
        eventType: "goal"
      },
      {
        providerEventId: "760415:774:981:94:256691",
        providerTeamId: "774",
        playerName: "Some Defender",
        assistPlayerName: null,
        minute: 17,
        stoppageMinute: null,
        eventType: "yellow_card"
      },
      {
        providerEventId: "760415:203:4023:137:167060",
        providerTeamId: "203",
        playerName: "Santiago Giménez",
        assistPlayerName: null,
        minute: 67,
        stoppageMinute: null,
        eventType: "goal"
      }
    ]
  });
});

test("classifies a red card event distinctly from a yellow card", () => {
  const event = {
    id: "999000",
    date: "2026-06-20T18:00Z",
    season: { year: 2026 },
    competitions: [
      {
        venue: { id: "1700", fullName: "Sample Arena" },
        altGameNote: "FIFA World Cup, Group A",
        status: { clock: 5400, type: { name: "STATUS_FULL_TIME" } },
        competitors: [
          { homeAway: "home", score: "1", team: { id: "203", displayName: "Mexico", abbreviation: "MEX" } },
          { homeAway: "away", score: "0", team: { id: "774", displayName: "South Africa", abbreviation: "RSA" } }
        ],
        details: [
          {
            type: { id: "93", text: "Red Card" },
            clock: { value: 3000, displayValue: "50'" },
            team: { id: "774" },
            scoringPlay: false,
            redCard: true,
            yellowCard: false,
            penaltyKick: false,
            ownGoal: false,
            athletesInvolved: [{ id: "300001", displayName: "Some Striker" }]
          }
        ]
      }
    ]
  };

  const result = normalizeEspnFixture(event);

  assert.deepEqual(result.events, [
    {
      providerEventId: "999000:774:3000:93:300001",
      providerTeamId: "774",
      playerName: "Some Striker",
      assistPlayerName: null,
      minute: 50,
      stoppageMinute: null,
      eventType: "red_card"
    }
  ]);
});

test("normalizes a scheduled fixture with null scores and no events", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnFixture(raw.events[1]);

  assert.equal(result.status, "scheduled");
  assert.equal(result.home.goals, null);
  assert.equal(result.away.goals, null);
  assert.deepEqual(result.events, []);
});

test("normalizes a placeholder knockout fixture without throwing", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnFixture(raw.events[2]);

  assert.equal(result.home.providerTeamId, "5926");
  assert.equal(result.away.providerTeamId, "5924");
  assert.deepEqual(result.venue, { providerVenueId: null, name: null });
});

test("status mapping covers scheduled, live, final, postponed, result_pending", () => {
  const cases = [
    ["STATUS_SCHEDULED", "scheduled"],
    ["STATUS_IN_PROGRESS", "live"],
    ["STATUS_HALFTIME", "live"],
    ["STATUS_FULL_TIME", "final"],
    ["STATUS_POSTPONED", "postponed"],
    ["STATUS_CANCELED", "postponed"],
    ["STATUS_SUSPENDED", "result_pending"],
    ["STATUS_ABANDONED", "result_pending"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeEspnStatus(input), expected, input);
  }
});

test("rejects a fixture missing a competitor", () => {
  assert.throws(
    () => normalizeEspnFixture({ id: "1", competitions: [{ competitors: [] }] }),
    /ESPN fixture 1 is missing home or away competitor/
  );
});

test("normalizeEspnPayload filters out fixtures with unresolved placeholder teams", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const teamsRaw = await loadFixture("espn-teams.sample.json");
  const knownTeamIds = new Set(normalizeEspnTeams(teamsRaw).map((team) => team.providerTeamId));

  const result = normalizeEspnPayload(raw, { knownTeamIds });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((fixture) => fixture.providerFixtureId), ["760415", "760416"]);
});

test("normalizeEspnPayload without knownTeamIds returns every fixture", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnPayload(raw);
  assert.equal(result.length, 3);
});

test("normalizeEspnTeams returns provider-neutral team rows", async () => {
  const teamsRaw = await loadFixture("espn-teams.sample.json");
  const result = normalizeEspnTeams(teamsRaw);

  assert.deepEqual(result, [
    { providerTeamId: "203", name: "Mexico", code: "MEX" },
    { providerTeamId: "774", name: "South Africa", code: "RSA" },
    { providerTeamId: "773", name: "Czechia", code: "CZE" }
  ]);
});

const rawFixture = {
  id: "760441",
  date: "2026-06-19T01:00Z",
  competitions: [
    {
      venue: { fullName: "Estadio Akron" },
      status: { type: { state: "pre" } },
      competitors: [
        { homeAway: "home", score: "0", team: { id: "203", abbreviation: "MEX", displayName: "Mexico" } },
        {
          homeAway: "away",
          score: "0",
          team: { id: "451", abbreviation: "KOR", displayName: "Korea Republic" }
        }
      ],
      details: []
    }
  ]
};

test("normalizes ESPN result data while retaining metadata for drift checks", () => {
  const normalized = normalizeEspnFixture(rawFixture);

  assert.equal(normalized.provider, "espn");
  assert.equal(normalized.providerFixtureId, "760441");
  assert.equal(normalized.kickoffAt, "2026-06-19T01:00Z");
  assert.equal(normalized.venueName, "Estadio Akron");
  assert.equal(normalized.home.code, "MEX");
  assert.equal(normalized.away.code, "KOR");
});

test("reports fixed metadata drift without creating replacement fields", () => {
  const normalized = normalizeEspnFixture(rawFixture);
  const drift = compareFixedFixtureMetadata(normalized, {
    kickoff: "2026-06-18T18:00:00.000Z",
    venue: "Los Angeles",
    homeTeamId: "MEX",
    awayTeamId: "KOR"
  });

  assert.deepEqual(drift.map((item) => item.field), ["kickoff", "venue"]);
});
