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
    stoppageMinutes: null,
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

test("uses a fallback player name when ESPN omits athlete details", () => {
  const event = {
    id: "999002",
    date: "2026-06-19T01:00Z",
    season: { year: 2026 },
    competitions: [
      {
        venue: { id: "1702", fullName: "Sample Ground" },
        altGameNote: "FIFA World Cup, Group D",
        status: { clock: 5400, type: { name: "STATUS_FULL_TIME" } },
        competitors: [
          { homeAway: "home", score: "1", team: { id: "660", displayName: "United States", abbreviation: "USA" } },
          { homeAway: "away", score: "1", team: { id: "465", displayName: "Turkey", abbreviation: "TUR" } }
        ],
        details: [
          {
            type: { id: "94", text: "Yellow Card" },
            clock: { value: 3756, displayValue: "63'" },
            team: { id: "465" },
            scoringPlay: false,
            redCard: false,
            yellowCard: true,
            penaltyKick: false,
            ownGoal: false
          }
        ]
      }
    ]
  };

  const result = normalizeEspnFixture(event);

  assert.deepEqual(result.events, [
    {
      providerEventId: "999002:465:3756:94:0",
      providerTeamId: "465",
      playerName: "Unknown player",
      assistPlayerName: null,
      minute: 63,
      stoppageMinute: null,
      eventType: "yellow_card"
    }
  ]);
});

test("parses ESPN stoppage-time clock display values", () => {
  const event = {
    id: "999001",
    date: "2026-06-28T19:00Z",
    season: { year: 2026 },
    competitions: [
      {
        venue: { id: "1701", fullName: "Sample Stadium" },
        altGameNote: "FIFA World Cup, Round of 32",
        status: { clock: 5400, type: { name: "STATUS_FULL_TIME" } },
        competitors: [
          { homeAway: "home", score: "2", team: { id: "205", displayName: "Brazil", abbreviation: "BRA" } },
          { homeAway: "away", score: "1", team: { id: "627", displayName: "Japan", abbreviation: "JPN" } }
        ],
        details: [
          {
            type: { id: "70", text: "Goal" },
            clock: { value: 5400, displayValue: "90'+5'" },
            team: { id: "205" },
            scoringPlay: true,
            redCard: false,
            yellowCard: false,
            penaltyKick: false,
            ownGoal: false,
            athletesInvolved: [{ id: "269844", displayName: "Gabriel Martinelli" }]
          }
        ]
      }
    ]
  };

  const result = normalizeEspnFixture(event);

  assert.deepEqual(result.events, [
    {
      providerEventId: "999001:205:5400:70:269844",
      providerTeamId: "205",
      playerName: "Gabriel Martinelli",
      assistPlayerName: null,
      minute: 90,
      stoppageMinute: 5,
      eventType: "goal"
    }
  ]);
});

test("normalizes ESPN missed shootout penalties", () => {
  const event = {
    id: "999003",
    date: "2026-06-29T01:00Z",
    season: { year: 2026 },
    competitions: [
      {
        venue: { id: "1703", fullName: "Shootout Stadium" },
        altGameNote: "FIFA World Cup, Round of 32",
        status: { clock: 7200, type: { name: "STATUS_FULL_TIME" } },
        competitors: [
          { homeAway: "home", score: "1", shootoutScore: "2", team: { id: "381", displayName: "Netherlands", abbreviation: "NED" } },
          { homeAway: "away", score: "1", shootoutScore: "3", team: { id: "2869", displayName: "Morocco", abbreviation: "MAR" } }
        ],
        details: [
          {
            type: { id: "87", text: "Penalty - Missed" },
            clock: { value: 7200, displayValue: "120'" },
            team: { id: "381" },
            scoringPlay: false,
            redCard: false,
            yellowCard: false,
            penaltyKick: true,
            ownGoal: false,
            athletesInvolved: [{ id: "12345", displayName: "J. Kluivert" }]
          }
        ]
      }
    ]
  };

  const result = normalizeEspnFixture(event);

  assert.deepEqual(result.events, [
    {
      providerEventId: "999003:381:7200:87:12345",
      providerTeamId: "381",
      playerName: "J. Kluivert",
      assistPlayerName: null,
      minute: 120,
      stoppageMinute: null,
      eventType: "penalty_miss"
    }
  ]);
});

test("normalizes ESPN summary shootout attempts", () => {
  const event = {
    id: "999004",
    date: "2026-06-30T01:00Z",
    season: { year: 2026 },
    competitions: [
      {
        venue: { id: "1704", fullName: "Shootout Stadium" },
        altGameNote: "FIFA World Cup, Round of 32",
        status: { clock: 7200, type: { name: "STATUS_FULL_TIME" } },
        competitors: [
          { homeAway: "home", score: "1", shootoutScore: "2", team: { id: "381", displayName: "Netherlands", abbreviation: "NED" } },
          { homeAway: "away", score: "1", shootoutScore: "3", team: { id: "2869", displayName: "Morocco", abbreviation: "MAR" } }
        ],
        details: [
          {
            type: { id: "72", text: "Penalty - Scored" },
            clock: { value: 7200, displayValue: "120'" },
            team: { id: "381" },
            scoringPlay: true,
            penaltyKick: true,
            athletesInvolved: [{ id: "258968", displayName: "Teun Koopmeiners" }]
          }
        ],
        shootout: [
          {
            id: "381",
            shots: [
              { id: "49665202", playerId: "258968", player: "Teun Koopmeiners", shotNumber: 1, didScore: true },
              { id: "49665204", playerId: "245916", player: "Justin Kluivert", shotNumber: 2, didScore: false }
            ]
          },
          {
            id: "2869",
            shots: [
              { id: "49665203", playerId: "323807", player: "Neil El Aynaoui", shotNumber: 1, didScore: false }
            ]
          }
        ]
      }
    ]
  };

  const result = normalizeEspnFixture(event);

  assert.deepEqual(result.events, [
    {
      providerEventId: "999004:381:shootout:1:49665202",
      providerTeamId: "381",
      playerName: "Teun Koopmeiners",
      assistPlayerName: null,
      minute: 120,
      stoppageMinute: 1,
      eventType: "penalty_goal"
    },
    {
      providerEventId: "999004:381:shootout:2:49665204",
      providerTeamId: "381",
      playerName: "Justin Kluivert",
      assistPlayerName: null,
      minute: 120,
      stoppageMinute: 2,
      eventType: "penalty_miss"
    },
    {
      providerEventId: "999004:2869:shootout:1:49665203",
      providerTeamId: "2869",
      playerName: "Neil El Aynaoui",
      assistPlayerName: null,
      minute: 120,
      stoppageMinute: 1,
      eventType: "penalty_miss"
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
    ["STATUS_FIRST_HALF", "live"],
    ["STATUS_SECOND_HALF", "live"],
    ["STATUS_HALFTIME", "HT"],
    ["STATUS_EXTRA_TIME", "ET"],
    ["STATUS_PENALTIES", "Pens"],
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
