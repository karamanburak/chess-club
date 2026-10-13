// Projector view. Keep values plain strings; placeholders are {name}. `de` must mirror `en` exactly.
const en = {
  present: "{n} present",
  waiting: "Waiting for the first pairing…",
  tonight: "Tonight",
  standings: "Standings",
  leaderboard: "Leaderboard",
  nextNight: "Next club night",
  live: "Live · refreshes every 5 seconds",
  back: "Back to the club →",
  gamesN: "{n} games",
  /** Between two names on a board without a result yet. */
  vs: "vs",
};
const de: typeof en = {
  present: "{n} anwesend",
  waiting: "Warten auf die erste Auslosung…",
  tonight: "Heute Abend",
  standings: "Tabelle",
  leaderboard: "Rangliste",
  nextNight: "Nächster Vereinsabend",
  live: "Live · aktualisiert alle 5 Sekunden",
  back: "Zurück zum Verein →",
  gamesN: "{n} Partien",
  vs: "gegen",
};
export const tv = { en, de };
