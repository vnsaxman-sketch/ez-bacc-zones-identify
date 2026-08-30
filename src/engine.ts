/* ============================================================
   EZ BACCARAT ENGINE
   Converted from the supplied Python/Tkinter application.

   IMPORTANT:
   Main Baccarat rules, thresholds, metrics, zone logic,
   Section-4 confirmations and entry logic are preserved.
   ============================================================ */

export type Result = "B" | "P" | "T";
export type Side = "B" | "P";

export type Card = number;

export interface BaccaratEvent {
  player_cards: Card[];
  banker_cards: Card[];

  player_third: Card | null;
  banker_third: Card | null;

  player_final: number;
  banker_final: number;

  result: Result;

  dragon7: boolean;
  panda8: boolean;
}

export interface Metrics {
  A: number;
  longest_run: number;

  blocks_2_2: number;
  blocks_3_2: number;
  blocks_2_3: number;
  blocks_3_3: number;

  entropy: number;

  SV: number;
  DV: number;
}

export type Zone =
  | "zigzag"
  | "trend-mix"
  | "streak"
  | "flip"
  | "noise"
  | "dominance"
  | "unknown";

export interface Suggestion {
  action: "bet" | "sit";
  side?: Side | null;
  unit: number;
  style: string;
  reason: string;
}

export interface PerHandRow {
  hand_index: number;
  result: Side;

  window: Side[];

  A: number;
  SV: number;
  DV: number;

  longest_run: number;

  blocks_2_2: number;
  blocks_3_2: number;
  blocks_2_3: number;
  blocks_3_3: number;

  entropy: number;

  zone: Zone;

  suggest_action: "bet" | "sit";
  suggest_side?: Side | null;
  suggest_unit: number;
  suggest_style: string;
  suggest_reason: string;
}

export interface Summary {
  target_resolved: number;

  total_hands: number;
  total_banker: number;
  total_player: number;
  total_tie: number;

  pct_banker: number;
  pct_player: number;
  pct_tie: number;

  A_full: number;
  longest_run_full: number;

  blocks_2_2_full: number;
  blocks_3_2_full: number;
  blocks_2_3_full: number;
  blocks_3_3_full: number;

  entropy_full: number;

  SV_full: number;
  DV_full: number;

  pct_zone_zigzag: number;
  pct_zone_trend_mix: number;
  pct_zone_streak: number;
  pct_zone_flip: number;
  pct_zone_noise: number;
  pct_zone_dominance: number;
}

export interface EntryCandidate {
  entry_idx: number;
  trigger_idx: number;
  reason: string;
  suggest_side: Side;
  style: string;
}

export interface ShoeSimulation {
  events: BaccaratEvent[];
  resolved: Result[];
  resolved_bp_full: Side[];

  per_hand_rows: PerHandRow[];

  summary: Summary;

  entry_candidates: EntryCandidate[];
}

/* ============================================================
   CONFIG
   ============================================================ */

export const CUT_MIN = 72;
export const CUT_MAX = 81;

export const WINDOW = 20;

export const ALT_HIGH = 0.55;
export const ALT_LOW = 0.40;

export const STREAK_ZIGZAG_MAX = 2;
export const STREAK_STREAK_MIN = 4;

export const FLIP_2_2_THRESHOLD = 3;

export const ENTROPY_HIGH = 0.98;

export const BASE_UNIT = 1.0;

export const MAX_ROWS_BIGROAD = 6;

export const DEFAULT_CELL = 26;

export const CELL_PAD = 6;

export const ZONE_COLORS: Record<Zone, string> = {
  zigzag: "#1f77b4",
  "trend-mix": "#f39c12",
  streak: "#d62728",
  flip: "#9467bd",
  noise: "#7f7f7f",
  dominance: "#2ca02c",
  unknown: "#cccccc",
};

export const SIDE_COLORS: Record<Side, string> = {
  B: "#c93a31",
  P: "#2b6ea3",
};

/* ============================================================
   RANDOM / SHOE
   ============================================================ */

export function make8DeckShoe(
  shuffle = true
): Card[] {
  const shoe: Card[] = [];

  for (let deck = 0; deck < 8; deck++) {
    for (let rank = 1; rank <= 13; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        shoe.push(rank);
      }
    }
  }

  if (shuffle) {
    shuffleArray(shoe);
  }

  return shoe;
}

function shuffleArray<T>(array: T[]): void {
  for (
    let i = array.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [array[i], array[j]] =
      [array[j], array[i]];
  }
}

/* ============================================================
   CARD VALUES
   ============================================================ */

export function cardPoint(
  rank: number
): number {
  if (rank === 1) {
    return 1;
  }

  if (rank >= 2 && rank <= 9) {
    return rank;
  }

  return 0;
}

export function handTotalPoints(
  cards: Card[]
): number {
  return (
    cards.reduce(
      (sum, rank) =>
        sum + cardPoint(rank),
      0
    ) % 10
  );
}

/* ============================================================
   DEAL ONE BACCARAT HAND
   ============================================================ */

export function dealHandFromShoe(
  shoe: Card[],
  pos: number
): {
  nextPos: number;
  event: BaccaratEvent;
} {
  if (pos + 4 > shoe.length) {
    throw new Error("Shoe exhausted");
  }

  const playerCards: Card[] = [
    shoe[pos],
    shoe[pos + 2],
  ];

  const bankerCards: Card[] = [
    shoe[pos + 1],
    shoe[pos + 3],
  ];

  pos += 4;

  let playerTotal =
    handTotalPoints(playerCards);

  let bankerTotal =
    handTotalPoints(bankerCards);

  let playerThird:
    Card | null = null;

  let bankerThird:
    Card | null = null;

  /* ----------------------------------------------------------
     NATURALS
     ---------------------------------------------------------- */

  if (
    playerTotal === 8 ||
    playerTotal === 9 ||
    bankerTotal === 8 ||
    bankerTotal === 9
  ) {
    // No third cards.
  } else {

    /* --------------------------------------------------------
       PLAYER DRAWS ON 0-5
       -------------------------------------------------------- */

    if (playerTotal <= 5) {

      if (pos >= shoe.length) {
        throw new Error(
          "Shoe exhausted on player third"
        );
      }

      playerThird = shoe[pos];

      pos++;

      playerCards.push(
        playerThird
      );

      playerTotal =
        handTotalPoints(
          playerCards
        );
    }

    /* --------------------------------------------------------
       BANKER
       -------------------------------------------------------- */

    if (playerThird === null) {

      if (bankerTotal <= 5) {

        if (pos >= shoe.length) {
          throw new Error(
            "Shoe exhausted on banker third"
          );
        }

        bankerThird = shoe[pos];

        pos++;

        bankerCards.push(
          bankerThird
        );

        bankerTotal =
          handTotalPoints(
            bankerCards
          );
      }

    } else {

      const playerThirdPoint =
        handTotalPoints([
          playerThird,
        ]);

      let needDraw = false;

      if (bankerTotal <= 2) {
        needDraw = true;

      } else if (bankerTotal === 3) {
        needDraw =
          playerThirdPoint !== 8;

      } else if (bankerTotal === 4) {
        needDraw =
          playerThirdPoint >= 2 &&
          playerThirdPoint <= 7;

      } else if (bankerTotal === 5) {
        needDraw =
          playerThirdPoint >= 4 &&
          playerThirdPoint <= 7;

      } else if (bankerTotal === 6) {
        needDraw =
          playerThirdPoint === 6 ||
          playerThirdPoint === 7;

      } else {
        needDraw = false;
      }

      if (needDraw) {

        if (pos >= shoe.length) {
          throw new Error(
            "Shoe exhausted on banker conditional third"
          );
        }

        bankerThird = shoe[pos];

        pos++;

        bankerCards.push(
          bankerThird
        );

        bankerTotal =
          handTotalPoints(
            bankerCards
          );
      }
    }
  }

  const finalPlayer =
    handTotalPoints(
      playerCards
    );

  const finalBanker =
    handTotalPoints(
      bankerCards
    );

  let result: Result;

  if (finalBanker > finalPlayer) {
    result = "B";
  } else if (finalPlayer > finalBanker) {
    result = "P";
  } else {
    result = "T";
  }

  const dragon7 =
    result === "B" &&
    bankerCards.length === 3 &&
    handTotalPoints(
      bankerCards
    ) === 7;

  const panda8 =
    result === "P" &&
    playerCards.length === 3 &&
    handTotalPoints(
      playerCards
    ) === 8;

  return {
    nextPos: pos,

    event: {
      player_cards: playerCards,
      banker_cards: bankerCards,

      player_third: playerThird,
      banker_third: bankerThird,

      player_final: finalPlayer,
      banker_final: finalBanker,

      result,

      dragon7,
      panda8,
    },
  };
}

/* ============================================================
   SEQUENCE HELPERS
   ============================================================ */

function bpOnly(
  seq: string[]
): Side[] {
  return seq.filter(
    x => x === "B" || x === "P"
  ) as Side[];
}

/* ============================================================
   ALTERNATION DENSITY
   ============================================================ */

export function alternationDensity(
  seq: string[]
): number {

  const filtered =
    bpOnly(seq);

  const n =
    filtered.length;

  if (n < 2) {
    return 0;
  }

  let alts = 0;

  for (
    let i = 1;
    i < n;
    i++
  ) {
    if (
      filtered[i] !==
      filtered[i - 1]
    ) {
      alts++;
    }
  }

  return alts / (n - 1);
}

/* ============================================================
   STREAK EXTRACTION
   ============================================================ */

export function extractStreaks(
  seq: string[]
): number[] {

  const filtered =
    bpOnly(seq);

  if (!filtered.length) {
    return [];
  }

  const streaks: number[] = [];

  let current =
    filtered[0];

  let count = 1;

  for (
    let i = 1;
    i < filtered.length;
    i++
  ) {

    const x =
      filtered[i];

    if (x === current) {
      count++;

    } else {

      streaks.push(count);

      current = x;

      count = 1;
    }
  }

  streaks.push(count);

  return streaks;
}

/* ============================================================
   STREAK VOLATILITY
   ============================================================ */

export function streakVolatility(
  seq: string[]
): number {

  const streaks =
    extractStreaks(seq);

  const n =
    bpOnly(seq).length;

  if (
    !streaks.length ||
    streaks.length === 1
  ) {
    return 0;
  }

  const mean =
    streaks.reduce(
      (a, b) => a + b,
      0
    ) /
    streaks.length;

  const variance =
    streaks.reduce(
      (sum, x) =>
        sum +
        Math.pow(
          x - mean,
          2
        ),
      0
    ) /
    streaks.length;

  const sd =
    Math.sqrt(variance);

  return n > 0
    ? sd / Math.sqrt(n)
    : 0;
}

/* ============================================================
   DIRECTION VOLATILITY
   ============================================================ */

export function directionVolatility(
  seq: string[]
): number {

  const streaks =
    extractStreaks(seq);

  if (streaks.length <= 1) {
    return 0;
  }

  const diffs: number[] = [];

  for (
    let i = 1;
    i < streaks.length;
    i++
  ) {
    diffs.push(
      Math.abs(
        streaks[i] -
        streaks[i - 1]
      )
    );
  }

  const meanDiff =
    diffs.reduce(
      (a, b) => a + b,
      0
    ) /
    diffs.length;

  const meanStreak =
    streaks.reduce(
      (a, b) => a + b,
      0
    ) /
    streaks.length;

  return meanStreak > 0
    ? meanDiff / meanStreak
    : 0;
}

/* ============================================================
   BLOCKS
   ============================================================ */

export function count22Blocks(
  seq: string[]
): number {

  const filtered =
    bpOnly(seq);

  let count = 0;
  let i = 0;

  while (
    i + 3 <
    filtered.length
  ) {

    if (
      filtered[i] ===
        filtered[i + 1] &&
      filtered[i + 2] ===
        filtered[i + 3] &&
      filtered[i] !==
        filtered[i + 2]
    ) {

      count++;

      i += 4;

    } else {
      i++;
    }
  }

  return count;
}

export function countBlockType(
  seq: string[],
  a: number,
  b: number
): number {

  const filtered =
    bpOnly(seq);

  let i = 0;
  let count = 0;

  while (
    i + a + b - 1 <
    filtered.length
  ) {

    const first =
      filtered.slice(
        i,
        i + a
      );

    const second =
      filtered.slice(
        i + a,
        i + a + b
      );

    if (
      new Set(first).size === 1 &&
      new Set(second).size === 1 &&
      first[0] !== second[0]
    ) {

      count++;

      i++;

    } else {
      i++;
    }
  }

  return count;
}

/* ============================================================
   LONGEST RUN
   ============================================================ */

export function longestRunLength(
  seq: string[]
): number {

  const filtered =
    bpOnly(seq);

  if (!filtered.length) {
    return 0;
  }

  let current =
    filtered[0];

  let count = 1;

  let best = 1;

  for (
    let i = 1;
    i < filtered.length;
    i++
  ) {

    if (
      filtered[i] === current
    ) {

      count++;

      if (count > best) {
        best = count;
      }

    } else {

      current =
        filtered[i];

      count = 1;
    }
  }

  return best;
}

/* ============================================================
   ENTROPY
   ============================================================ */

export function normalizedEntropy(
  seq: string[]
): number {

  const filtered =
    bpOnly(seq);

  if (!filtered.length) {
    return 0;
  }

  let b = 0;
  let p = 0;

  for (const x of filtered) {
    if (x === "B") {
      b++;
    } else {
      p++;
    }
  }

  const total =
    b + p;

  const pb =
    b / total;

  const pp =
    p / total;

  if (
    pb === 0 ||
    pb === 1
  ) {
    return 0;
  }

  return -(
    pb * Math.log2(pb) +
    pp * Math.log2(pp)
  );
}

/* ============================================================
   METRICS
   ============================================================ */

export function computeMetrics(
  seq: string[]
): Metrics {

  return {
    A:
      alternationDensity(seq),

    longest_run:
      longestRunLength(seq),

    blocks_2_2:
      count22Blocks(seq),

    blocks_3_2:
      countBlockType(
        seq,
        3,
        2
      ),

    blocks_2_3:
      countBlockType(
        seq,
        2,
        3
      ),

    blocks_3_3:
      countBlockType(
        seq,
        3,
        3
      ),

    entropy:
      normalizedEntropy(seq),

    SV:
      streakVolatility(seq),

    DV:
      directionVolatility(seq),
  };
}

/* ============================================================
   ZONE LABEL
   ============================================================ */

export function labelZoneFromMetrics(
  m: Metrics
): Zone {

  const A =
    m.A;

  const SV =
    m.SV;

  const DV =
    m.DV;

  const L =
    m.longest_run;

  const b22 =
    m.blocks_2_2;

  const ent =
    m.entropy;

  if (
    b22 >= FLIP_2_2_THRESHOLD &&
    A >= 0.35 &&
    A <= 0.50 &&
    ent > 0.9
  ) {
    return "flip";
  }

  if (
    A >= ALT_HIGH &&
    L <= STREAK_ZIGZAG_MAX
  ) {
    return "zigzag";
  }

  if (
    L >= STREAK_STREAK_MIN &&
    A < ALT_LOW
  ) {
    return "streak";
  }

  if (
    A < 0.35 &&
    SV < 0.20
  ) {
    return "streak";
  }

  if (
    A > 0.65 &&
    DV > 0.80
  ) {
    return "flip";
  }

  if (
    A >= ALT_LOW &&
    A < ALT_HIGH &&
    L >= 2 &&
    L <= 4
  ) {
    return "trend-mix";
  }

  if (
    ent >= ENTROPY_HIGH
  ) {
    return "noise";
  }

  return "trend-mix";
}

/* ============================================================
   BET SUGGESTION
   ============================================================ */

export function suggestBetFromZone(
  zone: Zone,
  recentSeq: Side[],
  bankroll = 100,
  baseUnit = BASE_UNIT
): Suggestion {

  if (
    zone === "flip" ||
    zone === "noise"
  ) {

    return {
      action: "sit",
      unit: 0,
      style: "no-bet",
      reason: "flip_or_noise",
    };
  }

  if (
    zone === "zigzag"
  ) {

    const last =
      recentSeq[
        recentSeq.length - 1
      ];

    const side =
      last === "B"
        ? "P"
        : last === "P"
          ? "B"
          : null;

    return {
      action: "bet",
      side,
      unit: baseUnit,
      style:
        "contrarian_flat",
      reason: "zigzag",
    };
  }

  if (
    zone === "trend-mix"
  ) {

    if (
      recentSeq.length >= 2 &&
      recentSeq[
        recentSeq.length - 1
      ] ===
        recentSeq[
          recentSeq.length - 2
        ]
    ) {

      return {
        action: "bet",
        side:
          recentSeq[
            recentSeq.length - 1
          ],
        unit: baseUnit,
        style: "1-2_light",
        reason:
          "after2_follow",
      };
    }

    return {
      action: "sit",
      unit: 0,
      style: "observe",
      reason:
        "await_block",
    };
  }

  if (
    zone === "streak"
  ) {

    if (
      recentSeq.length >= 2 &&
      recentSeq[
        recentSeq.length - 1
      ] ===
        recentSeq[
          recentSeq.length - 2
        ]
    ) {

      const unit =
        Math.min(
          baseUnit * 2,
          bankroll * 0.02
        );

      return {
        action: "bet",
        side:
          recentSeq[
            recentSeq.length - 1
          ],
        unit,
        style: "1-2-3",
        reason:
          "streak_follow",
      };
    }

    return {
      action: "sit",
      unit: 0,
      style: "observe",
      reason:
        "await_streak",
    };
  }

  return {
    action: "sit",
    unit: 0,
    style: "no-bet",
    reason: "fallback",
  };
}

/* ============================================================
   SECTION 4
   ============================================================ */

export function is2Block(
  window: Side[]
): boolean {

  if (
    window.length >= 2 &&
    window[
      window.length - 1
    ] ===
      window[
        window.length - 2
      ]
  ) {
    return true;
  }

  if (window.length >= 4) {

    const s =
      window.slice(-4);

    if (
      s[0] === s[1] &&
      s[2] === s[3] &&
      s[0] !== s[2]
    ) {
      return true;
    }
  }

  return false;
}

export function is3Block(
  window: Side[]
): boolean {

  if (
    window.length >= 3 &&
    window[
      window.length - 1
    ] ===
      window[
        window.length - 2
      ] &&
    window[
      window.length - 2
    ] ===
      window[
        window.length - 3
      ]
  ) {
    return true;
  }

  if (window.length >= 3) {

    const s =
      window.slice(-3);

    if (
      s[0] === s[2] &&
      s[0] !== s[1]
    ) {
      return true;
    }
  }

  return false;
}

export function is212(
  window: Side[]
): boolean {

  if (window.length < 5) {
    return false;
  }

  const s =
    window.slice(-5);

  return (
    s[0] === s[1] &&
    s[3] === s[4] &&
    s[0] === s[4] &&
    s[2] !== s[0]
  );
}

export function is32(
  window: Side[]
): boolean {

  if (window.length < 5) {
    return false;
  }

  const s =
    window.slice(-5);

  return (
    s[0] === s[1] &&
    s[1] === s[2] &&
    s[3] === s[4] &&
    s[0] !== s[3]
  );
}

export function is23(
  window: Side[]
): boolean {

  if (window.length < 5) {
    return false;
  }

  const s =
    window.slice(-5);

  return (
    s[0] === s[1] &&
    s[2] === s[3] &&
    s[3] === s[4] &&
    s[0] !== s[2]
  );
}

export function isBlockBreakBlock(
  window: Side[]
): boolean {

  if (window.length < 5) {
    return false;
  }

  const s =
    window.slice(-5);

  return (
    s[0] === s[1] &&
    s[2] !== s[1] &&
    s[3] === s[4] &&
    s[0] === s[3]
  );
}

/* ============================================================
   TREND-MIX CONFIRMATION
   ============================================================ */

export function detectTrendMixConfirmation(
  window: Side[]
): [
  boolean,
  string | null,
  Side | null,
  string | null
] {

  if (window.length < 2) {
    return [
      false,
      null,
      null,
      null,
    ];
  }

  if (
    isBlockBreakBlock(window)
  ) {

    const s =
      window.slice(-5);

    return [
      true,
      "block-break-block",
      s[0],
      "block-echo (follow first block)",
    ];
  }

  if (is212(window)) {

    const s =
      window.slice(-5);

    return [
      true,
      "2-1-2",
      s[0],
      "2-1-2 echo (follow dominant)",
    ];
  }

  if (is32(window)) {

    const s =
      window.slice(-5);

    return [
      true,
      "3-2",
      s[0],
      "3-2 (bet longer block)",
    ];
  }

  if (is23(window)) {

    const s =
      window.slice(-5);

    return [
      true,
      "2-3",
      s[2],
      "2-3 (bet longer block)",
    ];
  }

  if (is3Block(window)) {

    return [
      true,
      "3-block",
      window[
        window.length - 1
      ],
      "3-block FTL",
    ];
  }

  if (is2Block(window)) {

    return [
      true,
      "2-block",
      window[
        window.length - 1
      ],
      "2-block FTL",
    ];
  }

  return [
    false,
    null,
    null,
    null,
  ];
}

/* ============================================================
   BIG ROAD
   ============================================================ */

export function buildBigRoadColumns(
  seq: Side[],
  maxRows = MAX_ROWS_BIGROAD
): Side[][] {

  const filtered =
    seq.filter(
      x => x === "B" || x === "P"
    );

  if (!filtered.length) {
    return [];
  }

  const cols: Side[][] = [
    [filtered[0]],
  ];

  for (
    let i = 1;
    i < filtered.length;
    i++
  ) {

    const current =
      filtered[i];

    const previous =
      filtered[i - 1];

    if (
      current === previous
    ) {

      if (
        cols[
          cols.length - 1
        ].length < maxRows
      ) {

        cols[
          cols.length - 1
        ].push(current);

      } else {

        cols.push([
          current,
        ]);
      }

    } else {

      cols.push([
        current,
      ]);
    }
  }

  return cols;
}

export interface RoadCoord {
  col: number;
  row: number;
}

export function bigRoadCoords(
  cols: Side[][]
): RoadCoord[] {

  const coords: RoadCoord[] = [];

  cols.forEach(
    (col, ci) => {

      col.forEach(
        (_value, ri) => {

          coords.push({
            col: ci,
            row: ri,
          });
        }
      );
    }
  );

  return coords;
}

/* ============================================================
   ENTRY CANDIDATES
   ============================================================ */

export function computeEntryCandidates(
  resolvedBP: Side[],
  perHandRows: PerHandRow[]
): EntryCandidate[] {

  const entries:
    EntryCandidate[] = [];

  const n =
    resolvedBP.length;

  for (
    let i = 0;
    i < n;
    i++
  ) {

    const window =
      resolvedBP.slice(
        Math.max(
          0,
          i - WINDOW + 1
        ),
        i + 1
      );

    const [
      ok,
      reason,
      side,
      style,
    ] =
      detectTrendMixConfirmation(
        window
      );

    if (
      ok &&
      side &&
      reason &&
      style
    ) {

      const entryIdx =
        i + 1;

      if (
        entryIdx < n
      ) {

        const duplicate =
          entries.some(
            e =>
              Math.abs(
                e.entry_idx -
                entryIdx
              ) <= 1
          );

        if (duplicate) {
          continue;
        }

        entries.push({
          entry_idx:
            entryIdx,

          trigger_idx:
            i,

          reason,

          suggest_side:
            side,

          style,
        });
      }
    }
  }

  return entries;
}

/* ============================================================
   SIMULATE ONE SHOE
   ============================================================ */

export function simulateOneShoeWithCut(
  seed?: number
): ShoeSimulation {

  /*
   The Python version uses random.randint.
   JavaScript does not have seeded randomness by default.
   The optional seed is therefore retained as an API
   parameter but normal browser simulation uses Math.random().
  */

  let targetResolved: number;

  if (
    seed !== undefined &&
    Number.isFinite(seed)
  ) {

    /*
     Simple deterministic local generator
     when a seed is explicitly supplied.
    */

    const rng =
      seededRandom(seed);

    targetResolved =
      Math.floor(
        rng() *
          (
            CUT_MAX -
            CUT_MIN +
            1
          )
      ) +
      CUT_MIN;

    const shoe =
      make8DeckShoeWithRandom(
        rng
      );

    return simulateUsingShoe(
      shoe,
      targetResolved
    );
  }

  targetResolved =
    Math.floor(
      Math.random() *
        (
          CUT_MAX -
          CUT_MIN +
          1
        )
    ) +
    CUT_MIN;

  const shoe =
    make8DeckShoe();

  return simulateUsingShoe(
    shoe,
    targetResolved
  );
}

function seededRandom(
  seed: number
): () => number {

  let state =
    seed >>> 0;

  return () => {

    state +=
      0x6d2b79f5;

    let t = state;

    t =
      Math.imul(
        t ^
          (t >>> 15),
        t | 1
      );

    t ^=
      t +
      Math.imul(
        t ^
          (t >>> 7),
        t | 61
      );

    return (
      (
        (t ^
          (t >>> 14)) >>>
        0
      ) /
      4294967296
    );
  };
}

function make8DeckShoeWithRandom(
  rng: () => number
): Card[] {

  const shoe: Card[] = [];

  for (
    let deck = 0;
    deck < 8;
    deck++
  ) {

    for (
      let rank = 1;
      rank <= 13;
      rank++
    ) {

      for (
        let copy = 0;
        copy < 4;
        copy++
      ) {

        shoe.push(rank);
      }
    }
  }

  for (
    let i = shoe.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        rng() *
          (i + 1)
      );

    [
      shoe[i],
      shoe[j],
    ] =
      [
        shoe[j],
        shoe[i],
      ];
  }

  return shoe;
}

function simulateUsingShoe(
  shoe: Card[],
  targetResolved: number
): ShoeSimulation {

  let pos = 0;

  const events:
    BaccaratEvent[] = [];

  const resolved:
    Result[] = [];

  while (
    pos + 4 <= shoe.length &&
    resolved.length <
      targetResolved
  ) {

    try {

      const result =
        dealHandFromShoe(
          shoe,
          pos
        );

      pos =
        result.nextPos;

      events.push(
        result.event
      );

      resolved.push(
        result.event.result
      );

    } catch {
      break;
    }
  }

  const resolvedBP:
    Side[] =
    resolved.filter(
      x =>
        x === "B" ||
        x === "P"
    ) as Side[];

  /* ----------------------------------------------------------
     PER-HAND ROWS
     ---------------------------------------------------------- */

  const perHandRows:
    PerHandRow[] = [];

  for (
    let i = 0;
    i < resolvedBP.length;
    i++
  ) {

    const windowSeq =
      resolvedBP.slice(
        Math.max(
          0,
          i - WINDOW + 1
        ),
        i + 1
      );

    const metrics =
      computeMetrics(
        windowSeq
      );

    const zone =
      labelZoneFromMetrics(
        metrics
      );

    const suggestion =
      suggestBetFromZone(
        zone,
        windowSeq
      );

    perHandRows.push({
      hand_index:
        i + 1,

      result:
        resolvedBP[i],

      window:
        [...windowSeq],

      A:
        round(
          metrics.A,
          4
        ),

      SV:
        round(
          metrics.SV,
          6
        ),

      DV:
        round(
          metrics.DV,
          6
        ),

      longest_run:
        metrics.longest_run,

      blocks_2_2:
        metrics.blocks_2_2,

      blocks_3_2:
        metrics.blocks_3_2,

      blocks_2_3:
        metrics.blocks_2_3,

      blocks_3_3:
        metrics.blocks_3_3,

      entropy:
        round(
          metrics.entropy,
          4
        ),

      zone,

      suggest_action:
        suggestion.action,

      suggest_side:
        suggestion.side,

      suggest_unit:
        suggestion.unit,

      suggest_style:
        suggestion.style,

      suggest_reason:
        suggestion.reason,
    });
  }

  /* ----------------------------------------------------------
     SUMMARY
     ---------------------------------------------------------- */

  const finalMetrics =
    computeMetrics(
      resolvedBP
    );

  const totalBanker =
    resolved.filter(
      x => x === "B"
    ).length;

  const totalPlayer =
    resolved.filter(
      x => x === "P"
    ).length;

  const totalTie =
    resolved.filter(
      x => x === "T"
    ).length;

  const totalHands =
    totalBanker +
    totalPlayer +
    totalTie;

  const pctBanker =
    totalHands
      ? (totalBanker /
          totalHands) *
        100
      : 0;

  const pctPlayer =
    totalHands
      ? (totalPlayer /
          totalHands) *
        100
      : 0;

  const pctTie =
    totalHands
      ? (totalTie /
          totalHands) *
        100
      : 0;

  const zones: Zone[] = [
    "zigzag",
    "trend-mix",
    "streak",
    "flip",
    "noise",
    "dominance",
  ];

  const zoneCounts:
    Record<string, number> = {};

  for (const z of zones) {
    zoneCounts[z] =
      perHandRows.filter(
        row =>
          row.zone === z
      ).length;
  }

  const zonePercent =
    (zone: Zone) =>
      perHandRows.length
        ? round(
            (
              (
                zoneCounts[
                  zone
                ] || 0
              ) /
              perHandRows.length
            ) *
              100,
            2
          )
        : 0;

  const summary: Summary = {
    target_resolved:
      targetResolved,

    total_hands:
      totalHands,

    total_banker:
      totalBanker,

    total_player:
      totalPlayer,

    total_tie:
      totalTie,

    pct_banker:
      round(
        pctBanker,
        2
      ),

    pct_player:
      round(
        pctPlayer,
        2
      ),

    pct_tie:
      round(
        pctTie,
        2
      ),

    A_full:
      round(
        finalMetrics.A,
        4
      ),

    longest_run_full:
      finalMetrics.longest_run,

    blocks_2_2_full:
      finalMetrics.blocks_2_2,

    blocks_3_2_full:
      finalMetrics.blocks_3_2,

    blocks_2_3_full:
      finalMetrics.blocks_2_3,

    blocks_3_3_full:
      finalMetrics.blocks_3_3,

    entropy_full:
      round(
        finalMetrics.entropy,
        4
      ),

    SV_full:
      round(
        finalMetrics.SV,
        6
      ),

    DV_full:
      round(
        finalMetrics.DV,
        6
      ),

    pct_zone_zigzag:
      zonePercent("zigzag"),

    pct_zone_trend_mix:
      zonePercent("trend-mix"),

    pct_zone_streak:
      zonePercent("streak"),

    pct_zone_flip:
      zonePercent("flip"),

    pct_zone_noise:
      zonePercent("noise"),

    pct_zone_dominance:
      zonePercent("dominance"),
  };

  const entryCandidates =
    computeEntryCandidates(
      resolvedBP,
      perHandRows
    );

  return {
    events,

    resolved,

    resolved_bp_full:
      resolvedBP,

    per_hand_rows:
      perHandRows,

    summary,

    entry_candidates:
      entryCandidates,
  };
}

/* ============================================================
   ROUNDING
   ============================================================ */

function round(
  value: number,
  decimals: number
): number {

  const factor =
    Math.pow(
      10,
      decimals
    );

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

/* ============================================================
   CSV
   ============================================================ */

export function perHandCSV(
  rows: PerHandRow[]
): string {

  if (!rows.length) {
    return "";
  }

  const headers =
    Object.keys(
      rows[0]
    );

  const lines = [
    headers.join(","),
  ];

  for (const row of rows) {

    const values =
      headers.map(
        header => {

          const value =
            (
              row as unknown as
              Record<
                string,
                unknown
              >
            )[header];

          if (
            Array.isArray(value)
          ) {
            return `"${value.join(" ")}"`;
          }

          if (
            typeof value ===
              "string" &&
            value.includes(",")
          ) {
            return `"${value}"`;
          }

          return String(
            value ?? ""
          );
        }
      );

    lines.push(
      values.join(",")
    );
  }

  return lines.join("\n");
}

export function summaryCSV(
  summary: Summary
): string {

  const headers =
    Object.keys(summary);

  const values =
    headers.map(
      h =>
        String(
          (
            summary as unknown as
            Record<
              string,
              unknown
            >
          )[h]
        )
    );

  return [
    headers.join(","),
    values.join(","),
  ].join("\n");
}

export function downloadCSV(
  filename: string,
  content: string
): void {

  const blob =
    new Blob(
      [content],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(
    url
  );
}
