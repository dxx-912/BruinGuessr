/** The live Play page's copy, word for word, plus the two calls to action the tiles gain. */
export const COPY = {
  sub: "Real Bruins know campus inside out. Five rounds to prove you actually go to class.",
  solo: { title: "Solo", body: "See how high you can score on the leaderboard.", cta: "Play now" },
  versus: { title: "Versus", body: "Join or host a lobby to play with friends!", cta: "Host or join" },
  features: [
    { title: "Look", body: "A photo from somewhere on UCLA's campus. No street names, no hints." },
    { title: "Pin", body: "Drop a pin on the campus map before the 30 seconds run out." },
    { title: "Score", body: "Up to 5,000 points a round. Land within 10 meters for a bullseye." },
  ],
} as const;
