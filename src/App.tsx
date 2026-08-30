import React, { useMemo, useState } from "react";

/* =========================================================
   CONFIG — PRESERVED FROM PYTHON APPLICATION
   ========================================================= */

const CUT_MIN = 72;
const CUT_MAX = 81;
const WINDOW = 20;

const ALT_HIGH = 0.55;
const ALT_LOW = 0.40;
const STREAK_ZIGZAG_MAX = 2;
const STREAK_STREAK_MIN = 4;
const FLIP_2_2_THRESHOLD = 3;
const ENTROPY_HIGH = 0.98;

const BASE_UNIT = 1.0;
const MAX_ROWS_BIGROAD = 6;

const ZONE_COLORS: Record<string, string> = {
  zigzag: "#1f77b4",
  "trend-mix": "#f39c12",
  streak: "#d62728",
  flip: "#9467bd",
  noise: "#7f7f7f",
  dominance: "#2ca02c",
  unknown: "#cccccc",
};

const SIDE_COLORS: Record<string, string> = {
  B: "#c93a31",
  P: "#2b6ea3",
};

/* =========================================================
   TYPES
   ========================================================= */

type Result = "B" | "P" | "T";

type Zone =
  | "zigzag"
  | "trend-mix"
  | "streak"
  | "flip"
  | "noise"
  | "dominance"
  | "unknown";

interface HandEvent {
  player_cards: number[];
  banker_cards: number[];
  player_third: number | null;
  banker_third: number | null;
  player_final: number;
  banker_final: number;
  result: Result;
  dragon7: boolean;
  panda8: boolean;
}

interface Metrics {
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

interface Suggestion {
  action: "bet" | "sit";
  side?: "B" | "P";
  unit: number;
  style: string;
  reason: string;
}

interface PerHandRow extends Metrics {
  hand_index: number;
  result: "B" | "P";
  window: Result[];
  zone: Zone;

  suggest_action: "bet" | "sit";
  suggest_side?: "B" | "P";
  suggest_unit: number;
  suggest_style: string;
  suggest_reason: string;
}

interface EntryCandidate {
  entry_idx: number;
  trigger_idx: number;
  reason: string;
  suggest_side: "B" | "P";
  style: string;
}

interface Summary {
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

interface ShoeData {
  events: HandEvent[];
  resolved: Result[];
  resolved_bp_full: ("B" | "P")[];
  per_hand_rows: PerHandRow[];
  summary: Summary;
  entry_candidates: EntryCandidate[];
}

/* =========================================================
   RANDOM / SHOE
   ========================================================= */

function make8DeckShoe(shuffle = true): number[] {
  const shoe: number[] = [];

  for (let deck = 0; deck < 8; deck++) {
    for (let rank = 1; rank <= 13; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        shoe.push(rank);
      }
    }
  }

  if (shuffle) {
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
  }

  return shoe;
}

/* =========================================================
   BACCARAT ENGINE
   ========================================================= */

function cardPoint(rank: number): number {
  if (rank === 1) return 1;

  if (rank >= 2 && rank <= 9) {
    return rank;
  }

  return 0;
}

function handTotalPoints(cards: number[]): number {
  return cards.reduce(
    (sum, rank) => sum + cardPoint(rank),
    0
  ) % 10;
}

function dealHandFromShoe(
  shoe: number[],
  pos: number
): {
  nextPos: number;
  event: HandEvent;
} {
  if (pos + 4 > shoe.length) {
    throw new Error("Shoe exhausted");
  }

  const pCards = [
    shoe[pos],
    shoe[pos + 2],
  ];

  const bCards = [
    shoe[pos + 1],
    shoe[pos + 3],
  ];

  pos += 4;

  let pTotal = handTotalPoints(pCards);
  let bTotal = handTotalPoints(bCards);

  let playerThird: number | null = null;
  let bankerThird: number | null = null;

  /* =======================================================
     NATURALS
     ======================================================= */

  if (
    pTotal === 8 ||
    pTotal === 9 ||
    bTotal === 8 ||
    bTotal === 9
  ) {
    // No third cards.
  } else {
    /* =====================================================
       PLAYER DRAWS ON 0–5
       ===================================================== */

    if (pTotal <= 5) {
      if (pos >= shoe.length) {
        throw new Error(
          "Shoe exhausted on player third"
        );
      }

      playerThird = shoe[pos++];

      pCards.push(playerThird);

      pTotal = handTotalPoints(pCards);
    }

    /* =====================================================
       BANKER DRAW RULE
       ===================================================== */

    if (playerThird === null) {
      if (bTotal <= 5) {
        if (pos >= shoe.length) {
          throw new Error(
            "Shoe exhausted on banker third"
          );
        }

        bankerThird = shoe[pos++];

        bCards.push(bankerThird);

        bTotal = handTotalPoints(bCards);
      }
    } else {
      const pt = handTotalPoints([
        playerThird,
      ]);

      let needDraw = false;

      if (bTotal <= 2) {
        needDraw = true;
      } else if (bTotal === 3) {
        needDraw = pt !== 8;
      } else if (bTotal === 4) {
        needDraw =
          pt >= 2 && pt <= 7;
      } else if (bTotal === 5) {
        needDraw =
          pt >= 4 && pt <= 7;
      } else if (bTotal === 6) {
        needDraw =
          pt === 6 || pt === 7;
      }

      if (needDraw) {
        if (pos >= shoe.length) {
          throw new Error(
            "Shoe exhausted on banker conditional third"
          );
        }

        bankerThird = shoe[pos++];

        bCards.push(bankerThird);

        bTotal = handTotalPoints(bCards);
      }
    }
  }

  const finalP =
    handTotalPoints(pCards);

  const finalB =
    handTotalPoints(bCards);

  let result: Result;

  if (finalB > finalP) {
    result = "B";
  } else if (finalP > finalB) {
    result = "P";
  } else {
    result = "T";
  }

  /* =======================================================
     EZ BACCARAT SIDE BETS
     ======================================================= */

  const dragon7 =
    result === "B" &&
    bCards.length === 3 &&
    handTotalPoints(bCards) === 7;

  const panda8 =
    result === "P" &&
    pCards.length === 3 &&
    handTotalPoints(pCards) === 8;

  return {
    nextPos: pos,

    event: {
      player_cards: pCards,
      banker_cards: bCards,

      player_third: playerThird,
      banker_third: bankerThird,

      player_final: finalP,
      banker_final: finalB,

      result,

      dragon7,
      panda8,
    },
  };
}

/* =========================================================
   METRICS
   ========================================================= */

function filterBP(
  seq: Result[]
): ("B" | "P")[] {
  return seq.filter(
    (x): x is "B" | "P" =>
      x === "B" || x === "P"
  );
}

function alternationDensity(
  seq: Result[]
): number {
  const bp = filterBP(seq);

  if (bp.length < 2) {
    return 0;
  }

  let alts = 0;

  for (let i = 1; i < bp.length; i++) {
    if (bp[i] !== bp[i - 1]) {
      alts++;
    }
  }

  return alts / (bp.length - 1);
}

function extractStreaks(
  seq: Result[]
): number[] {
  const bp = filterBP(seq);

  if (bp.length === 0) {
    return [];
  }

  const streaks: number[] = [];

  let current = bp[0];
  let count = 1;

  for (let i = 1; i < bp.length; i++) {
    if (bp[i] === current) {
      count++;
    } else {
      streaks.push(count);

      current = bp[i];
      count = 1;
    }
  }

  streaks.push(count);

  return streaks;
}

function streakVolatility(
  seq: Result[]
): number {
  const streaks = extractStreaks(seq);

  const n = filterBP(seq).length;

  if (streaks.length <= 1) {
    return 0;
  }

  const mean =
    streaks.reduce(
      (a, b) => a + b,
      0
    ) / streaks.length;

  const variance =
    streaks.reduce(
      (sum, x) =>
        sum +
        Math.pow(x - mean, 2),
      0
    ) / streaks.length;

  const sd = Math.sqrt(variance);

  return n > 0
    ? sd / Math.sqrt(n)
    : 0;
}

function directionVolatility(
  seq: Result[]
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
    ) / diffs.length;

  const meanStreak =
    streaks.reduce(
      (a, b) => a + b,
      0
    ) / streaks.length;

  return meanStreak > 0
    ? meanDiff / meanStreak
    : 0;
}

function count22Blocks(
  seq: Result[]
): number {
  const bp = filterBP(seq);

  let count = 0;
  let i = 0;

  while (
    i + 3 < bp.length
  ) {
    if (
      bp[i] === bp[i + 1] &&
      bp[i + 2] === bp[i + 3] &&
      bp[i] !== bp[i + 2]
    ) {
      count++;

      i += 4;
    } else {
      i++;
    }
  }

  return count;
}

function countBlockType(
  seq: Result[],
  a: number,
  b: number
): number {
  const bp = filterBP(seq);

  let i = 0;
  let count = 0;

  while (
    i + a + b - 1 <
    bp.length
  ) {
    const first = bp.slice(
      i,
      i + a
    );

    const second = bp.slice(
      i + a,
      i + a + b
    );

    if (
      new Set(first).size === 1 &&
      new Set(second).size === 1 &&
      first[0] !== second[0]
    ) {
      count++;
    }

    i++;
  }

  return count;
}

function longestRunLength(
  seq: Result[]
): number {
  const bp = filterBP(seq);

  if (bp.length === 0) {
    return 0;
  }

  let best = 1;
  let count = 1;

  for (let i = 1; i < bp.length; i++) {
    if (bp[i] === bp[i - 1]) {
      count++;

      if (count > best) {
        best = count;
      }
    } else {
      count = 1;
    }
  }

  return best;
}

function normalizedEntropy(
  seq: Result[]
): number {
  const bp = filterBP(seq);

  if (bp.length === 0) {
    return 0;
  }

  const b =
    bp.filter(
      (x) => x === "B"
    ).length;

  const p =
    bp.length - b;

  const pb =
    b / bp.length;

  const pp =
    p / bp.length;

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

function computeMetrics(
  seq: Result[]
): Metrics {
  return {
    A: alternationDensity(seq),

    longest_run:
      longestRunLength(seq),

    blocks_2_2:
      count22Blocks(seq),

    blocks_3_2:
      countBlockType(seq, 3, 2),

    blocks_2_3:
      countBlockType(seq, 2, 3),

    blocks_3_3:
      countBlockType(seq, 3, 3),

    entropy:
      normalizedEntropy(seq),

    SV:
      streakVolatility(seq),

    DV:
      directionVolatility(seq),
  };
}

/* =========================================================
   ZONE
   ========================================================= */

function labelZone(
  m: Metrics
): Zone {
  const {
    A,
    SV,
    DV,
    longest_run: L,
    blocks_2_2: b22,
    entropy,
  } = m;

  if (
    b22 >= FLIP_2_2_THRESHOLD &&
    A >= 0.35 &&
    A <= 0.5 &&
    entropy > 0.9
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
    entropy >= ENTROPY_HIGH
  ) {
    return "noise";
  }

  return "trend-mix";
}

/* =========================================================
   BETTING SUGGESTION
   ========================================================= */

function suggestBet(
  zone: Zone,
  recentSeq: Result[],
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

  if (zone === "zigzag") {
    const last =
      recentSeq[
        recentSeq.length - 1
      ];

    const side =
      last === "B"
        ? "P"
        : last === "P"
        ? "B"
        : undefined;

    return {
      action: "bet",
      side,
      unit: baseUnit,
      style: "contrarian_flat",
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
      const side =
        recentSeq[
          recentSeq.length - 1
        ] as "B" | "P";

      return {
        action: "bet",
        side,
        unit: baseUnit,
        style: "1-2_light",
        reason: "after2_follow",
      };
    }

    return {
      action: "sit",
      unit: 0,
      style: "observe",
      reason: "await_block",
    };
  }

  if (zone === "streak") {
    if (
      recentSeq.length >= 2 &&
      recentSeq[
        recentSeq.length - 1
      ] ===
        recentSeq[
          recentSeq.length - 2
        ]
    ) {
      const side =
        recentSeq[
          recentSeq.length - 1
        ] as "B" | "P";

      const unit = Math.min(
        baseUnit * 2,
        bankroll * 0.02
      );

      return {
        action: "bet",
        side,
        unit,
        style: "1-2-3",
        reason: "streak_follow",
      };
    }

    return {
      action: "sit",
      unit: 0,
      style: "observe",
      reason: "await_streak",
    };
  }

  return {
    action: "sit",
    unit: 0,
    style: "no-bet",
    reason: "fallback",
  };
}

/* =========================================================
   SECTION-4 CONFIRMATION FUNCTIONS
   ========================================================= */

function is2Block(
  window: Result[]
): boolean {
  const bp = filterBP(window);

  if (
    bp.length >= 2 &&
    bp[bp.length - 1] ===
      bp[bp.length - 2]
  ) {
    return true;
  }

  if (bp.length >= 4) {
    const s = bp.slice(-4);

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

function is3Block(
  window: Result[]
): boolean {
  const bp = filterBP(window);

  if (
    bp.length >= 3 &&
    bp[bp.length - 1] ===
      bp[bp.length - 2] &&
    bp[bp.length - 1] ===
      bp[bp.length - 3]
  ) {
    return true;
  }

  if (bp.length >= 3) {
    const s = bp.slice(-3);

    if (
      s[0] === s[2] &&
      s[0] !== s[1]
    ) {
      return true;
    }
  }

  return false;
}

function is212(
  window: Result[]
): boolean {
  const bp = filterBP(window);

  if (bp.length < 5) {
    return false;
  }

  const s = bp.slice(-5);

  return (
    s[0] === s[1] &&
    s[3] === s[4] &&
    s[0] === s[4] &&
    s[2] !== s[0]
  );
}

function is32(
  window: Result[]
): boolean {
  const bp = filterBP(window);

  if (bp.length < 5) {
    return false;
  }

  const s = bp.slice(-5);

  return (
    s[0] === s[1] &&
    s[0] === s[2] &&
    s[3] === s[4] &&
    s[0] !== s[3]
  );
}

function is23(
  window: Result[]
): boolean {
  const bp = filterBP(window);

  if (bp.length < 5) {
    return false;
  }

  const s = bp.slice(-5);

  return (
    s[0] === s[1] &&
    s[2] === s[3] &&
    s[2] === s[4] &&
    s[0] !== s[2]
  );
}

function isBlockBreakBlock(
  window: Result[]
): boolean {
  const bp = filterBP(window);

  if (bp.length < 5) {
    return false;
  }

  const s = bp.slice(-5);

  return (
    s[0] === s[1] &&
    s[2] !== s[1] &&
    s[3] === s[4] &&
    s[0] === s[3]
  );
}

function detectTrendMixConfirmation(
  window: Result[]
): {
  ok: boolean;
  reason: string | null;
  side: "B" | "P" | null;
  style: string | null;
} {
  const bp = filterBP(window);

  if (bp.length < 2) {
    return {
      ok: false,
      reason: null,
      side: null,
      style: null,
    };
  }

  if (isBlockBreakBlock(bp)) {
    return {
      ok: true,
      reason: "block-break-block",
      side:
        bp[
          bp.length - 5
        ] as "B" | "P",
      style:
        "block-echo (follow first block)",
    };
  }

  if (is212(bp)) {
    return {
      ok: true,
      reason: "2-1-2",
      side:
        bp[
          bp.length - 5
        ] as "B" | "P",
      style:
        "2-1-2 echo (follow dominant)",
    };
  }

  if (is32(bp)) {
    return {
      ok: true,
      reason: "3-2",
      side:
        bp[
          bp.length - 5
        ] as "B" | "P",
      style:
        "3-2 (bet longer block)",
    };
  }

  if (is23(bp)) {
    return {
      ok: true,
      reason: "2-3",
      side:
        bp[
          bp.length - 3
        ] as "B" | "P",
      style:
        "2-3 (bet longer block)",
    };
  }

  if (is3Block(bp)) {
    return {
      ok: true,
      reason: "3-block",
      side:
        bp[
          bp.length - 1
        ] as "B" | "P",
      style: "3-block FTL",
    };
  }

  if (is2Block(bp)) {
    return {
      ok: true,
      reason: "2-block",
      side:
        bp[
          bp.length - 1
        ] as "B" | "P",
      style: "2-block FTL",
    };
  }

  return {
    ok: false,
    reason: null,
    side: null,
    style: null,
  };
}

/* =========================================================
   BIG ROAD
   ========================================================= */

function buildBigRoadColumns(
  seq: ("B" | "P")[],
  maxRows = MAX_ROWS_BIGROAD
): ("B" | "P")[][] {
  if (seq.length === 0) {
    return [];
  }

  const cols: ("B" | "P")[][] = [
    [seq[0]],
  ];

  for (
    let i = 1;
    i < seq.length;
    i++
  ) {
    const current = seq[i];

    const previous =
      seq[i - 1];

    if (current === previous) {
      if (
        cols[
          cols.length - 1
        ].length < maxRows
      ) {
        cols[
          cols.length - 1
        ].push(current);
      } else {
        cols.push([current]);
      }
    } else {
      cols.push([current]);
    }
  }

  return cols;
}

/* =========================================================
   ENTRY CANDIDATES
   ========================================================= */

function computeEntryCandidates(
  resolvedBP: ("B" | "P")[],
  _rows: PerHandRow[]
): EntryCandidate[] {
  const entries: EntryCandidate[] = [];

  for (
    let i = 0;
    i < resolvedBP.length;
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

    const confirmation =
      detectTrendMixConfirmation(
        window
      );

    if (
      confirmation.ok &&
      confirmation.side
    ) {
      const entryIdx =
        i + 1;

      if (
        entryIdx <
        resolvedBP.length
      ) {
        if (
          entries.some(
            (e) =>
              Math.abs(
                e.entry_idx -
                  entryIdx
              ) <= 1
          )
        ) {
          continue;
        }

        entries.push({
          entry_idx:
            entryIdx,

          trigger_idx: i,

          reason:
            confirmation.reason!,

          suggest_side:
            confirmation.side,

          style:
            confirmation.style!,
        });
      }
    }
  }

  return entries;
}

/* =========================================================
   SIMULATE ONE SHOE
   ========================================================= */

function simulateOneShoe(): ShoeData {
  const targetResolved =
    Math.floor(
      Math.random() *
        (CUT_MAX - CUT_MIN + 1)
    ) + CUT_MIN;

  const shoe =
    make8DeckShoe(true);

  let pos = 0;

  const events: HandEvent[] = [];
  const resolved: Result[] = [];

  while (
    pos + 4 <= shoe.length &&
    resolved.length <
      targetResolved
  ) {
    try {
      const dealt =
        dealHandFromShoe(
          shoe,
          pos
        );

      pos =
        dealt.nextPos;

      events.push(
        dealt.event
      );

      resolved.push(
        dealt.event.result
      );
    } catch {
      break;
    }
  }

  const resolvedBP =
    filterBP(resolved);

  const perHandRows: PerHandRow[] =
    [];

  for (
    let i = 0;
    i < resolvedBP.length;
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

    const metrics =
      computeMetrics(window);

    const zone =
      labelZone(metrics);

    const suggestion =
      suggestBet(
        zone,
        window
      );

    perHandRows.push({
      hand_index: i + 1,

      result:
        resolvedBP[i],

      window,

      ...metrics,

      A: Number(
        metrics.A.toFixed(4)
      ),

      SV: Number(
        metrics.SV.toFixed(6)
      ),

      DV: Number(
        metrics.DV.toFixed(6)
      ),

      entropy: Number(
        metrics.entropy.toFixed(4)
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

  const finalMetrics =
    computeMetrics(
      resolvedBP
    );

  const totalB =
    resolved.filter(
      (x) => x === "B"
    ).length;

  const totalP =
    resolved.filter(
      (x) => x === "P"
    ).length;

  const totalT =
    resolved.filter(
      (x) => x === "T"
    ).length;

  const totalHands =
    resolved.length;

  const zoneCounts:
    Record<string, number> =
    {};

  for (
    const row of perHandRows
  ) {
    zoneCounts[row.zone] =
      (zoneCounts[
        row.zone
      ] || 0) + 1;
  }

  const zonePct = (
    zone: string
  ) =>
    perHandRows.length
      ? Number(
          (
            ((zoneCounts[
              zone
            ] || 0) /
              perHandRows.length) *
            100
          ).toFixed(2)
        )
      : 0;

  const summary: Summary = {
    target_resolved:
      targetResolved,

    total_hands:
      totalHands,

    total_banker:
      totalB,

    total_player:
      totalP,

    total_tie:
      totalT,

    pct_banker:
      totalHands
        ? Number(
            (
              (totalB /
                totalHands) *
              100
            ).toFixed(2)
          )
        : 0,

    pct_player:
      totalHands
        ? Number(
            (
              (totalP /
                totalHands) *
              100
            ).toFixed(2)
          )
        : 0,

    pct_tie:
      totalHands
        ? Number(
            (
              (totalT /
                totalHands) *
              100
            ).toFixed(2)
          )
        : 0,

    A_full: Number(
      finalMetrics.A.toFixed(4)
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
      Number(
        finalMetrics.entropy.toFixed(
          4
        )
      ),

    SV_full:
      Number(
        finalMetrics.SV.toFixed(
          6
        )
      ),

    DV_full:
      Number(
        finalMetrics.DV.toFixed(
          6
        )
      ),

    pct_zone_zigzag:
      zonePct("zigzag"),

    pct_zone_trend_mix:
      zonePct("trend-mix"),

    pct_zone_streak:
      zonePct("streak"),

    pct_zone_flip:
      zonePct("flip"),

    pct_zone_noise:
      zonePct("noise"),

    pct_zone_dominance:
      zonePct("dominance"),
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

/* =========================================================
   CSV EXPORT
   ========================================================= */

function downloadCSV(
  filename: string,
  rows: Record<
    string,
    unknown
  >[]
) {
  if (!rows.length) {
    return;
  }

  const keys =
    Object.keys(rows[0]);

  const escapeCSV = (
    value: unknown
  ) => {
    if (
      Array.isArray(value)
    ) {
      value =
        value.join(" ");
    }

    const str =
      String(
        value ?? ""
      );

    if (
      str.includes(",") ||
      str.includes('"') ||
      str.includes("\n")
    ) {
      return `"${str.replace(
        /"/g,
        '""'
      )}"`;
    }

    return str;
  };

  const csv = [
    keys.join(","),
    ...rows.map(
      (row) =>
        keys
          .map((key) =>
            escapeCSV(
              row[key]
            )
          )
          .join(",")
    ),
  ].join("\n");

  const blob =
    new Blob(
      [csv],
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
  a.download =
    filename;

  document.body.appendChild(
    a
  );

  a.click();

  document.body.removeChild(
    a
  );

  URL.revokeObjectURL(
    url
  );
}

/* =========================================================
   MAIN REACT APPLICATION
   ========================================================= */

export default function App() {
  const [shoe, setShoe] =
    useState<ShoeData>(() =>
      simulateOneShoe()
    );

  const [viewUntil, setViewUntil] =
    useState<number | null>(
      null
    );

  const [zoom, setZoom] =
    useState(1);

  const [selectedHand, setSelectedHand] =
    useState<PerHandRow | null>(
      null
    );

  const [showDetails, setShowDetails] =
    useState(false);

  /* =====================================================
     NEW SHOE
     ===================================================== */

  function newShoe() {
    setShoe(
      simulateOneShoe()
    );

    setViewUntil(null);

    setSelectedHand(null);

    setShowDetails(false);
  }

  /* =====================================================
     NEXT HAND
     ===================================================== */

  function nextHand() {
    const total =
      shoe.resolved_bp_full
        .length;

    if (
      viewUntil === null
    ) {
      setViewUntil(1);
    } else {
      setViewUntil(
        Math.min(
          viewUntil + 1,
          total
        )
      );
    }
  }

  /* =====================================================
     RESET VIEW
     ===================================================== */

  function resetView() {
    setViewUntil(null);
  }

  /* =====================================================
     CURRENT VISIBLE BP
     ===================================================== */

  const visibleBP =
    useMemo(() => {
      const total =
        shoe.resolved_bp_full
          .length;

      const count =
        viewUntil === null
          ? total
          : Math.min(
              viewUntil,
              total
            );

      return shoe.resolved_bp_full.slice(
        0,
        count
      );
    }, [
      shoe,
      viewUntil,
    ]);

  /* =====================================================
     BIG ROAD
     ===================================================== */

  const columns =
    useMemo(
      () =>
        buildBigRoadColumns(
          visibleBP,
          MAX_ROWS_BIGROAD
        ),
      [visibleBP]
    );

  /* =====================================================
     MARKER HAND INDEX MAP

     IMPORTANT:
     There are NO overlays here.

     Each Big Road position contains only
     the B/P marker.
     ===================================================== */

  const markerMap =
    useMemo(() => {
      const result: {
        row: number;
        col: number;
        handIndex: number;
        value: "B" | "P";
      }[] = [];

      let bpIndex = 0;

      columns.forEach(
        (
          column,
          colIndex
        ) => {
          column.forEach(
            (
              value,
              rowIndex
            ) => {
              result.push({
                row: rowIndex,
                col: colIndex,
                handIndex:
                  bpIndex,
                value,
              });

              bpIndex++;
            }
          );
        }
      );

      return result;
    }, [columns]);

  /* =====================================================
     CSV
     ===================================================== */

  function exportPerHandCSV() {
    downloadCSV(
      "ezb_per_hand.csv",

      shoe.per_hand_rows.map(
        (row) => ({
          ...row,

          window:
            row.window.join(
              " "
            ),
        })
      )
    );
  }

  function exportSummaryCSV() {
    downloadCSV(
      "ezb_shoe_summary.csv",

      [
        shoe.summary as unknown as Record<
          string,
          unknown
        >,
      ]
    );
  }

  /* =====================================================
     RENDER
     ===================================================== */

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">

      {/* =================================================
          HEADER
          ================================================= */}

      <header className="bg-slate-900 text-white px-4 py-3 shadow">

        <div className="max-w-[1600px] mx-auto">

          <h1 className="text-xl md:text-2xl font-bold">
            EZ Baccarat — Zones Identifying
            Training Simulation
          </h1>

          <p className="text-xs md:text-sm text-gray-300 mt-1">
            EDUCATIONAL PURPOSE — Long Nguyen
          </p>

        </div>

      </header>

      {/* =================================================
          MAIN
          ================================================= */}

      <main className="max-w-[1600px] mx-auto p-3 md:p-4">

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">

          {/* ===============================================
              BIG ROAD AREA
              =============================================== */}

          <section className="bg-white rounded-xl shadow overflow-hidden">

            <div className="p-3 border-b bg-gray-50">

              <div className="flex flex-wrap items-center gap-2">

                <span className="font-semibold">
                  Big Road
                </span>

                <span className="text-xs text-gray-500">
                  Visible B/P hands:{" "}
                  {visibleBP.length}
                </span>

              </div>

            </div>

            <div className="overflow-auto p-4">

              <div
                className="relative"
                style={{
                  minWidth:
                    Math.max(
                      700,
                      columns.length *
                        70 *
                        zoom
                    ),

                  minHeight:
                    500 * zoom,
                }}
              >

                {/* =========================================
                    CLEAN BIG ROAD GRID
                    ========================================= */}

                {Array.from(
                  {
                    length:
                      Math.max(
                        columns.length,
                        1
                      ),
                  },
                  (_, col) =>
                    Array.from(
                      {
                        length:
                          MAX_ROWS_BIGROAD,
                      },
                      (_, row) => {

                        const marker =
                          markerMap.find(
                            (m) =>
                              m.col ===
                                col &&
                              m.row ===
                                row
                          );

                        const hand =
                          marker
                            ? shoe
                                .per_hand_rows[
                                marker
                                  .handIndex
                              ]
                            : null;

                        return (
                          <div
                            key={`${col}-${row}`}
                            className="absolute border border-gray-100 bg-white"
                            style={{
                              left:
                                col *
                                64 *
                                zoom,

                              top:
                                row *
                                64 *
                                zoom,

                              width:
                                56 *
                                zoom,

                              height:
                                56 *
                                zoom,
                            }}
                          >

                            {marker && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (hand) {
                                    setSelectedHand(
                                      hand
                                    );

                                    setShowDetails(
                                      true
                                    );
                                  }
                                }}
                                className="absolute inset-0 flex items-center justify-center"
                                aria-label={`Hand ${
                                  marker.handIndex +
                                  1
                                } ${
                                  marker.value
                                }`}
                              >

                                {/* =================================
                                    ONLY B/P CIRCLE
                                    NO OVERLAY
                                    NO ZONE BORDER
                                    NO BET/SIT
                                    NO ENTRY LABEL
                                    ================================= */}

                                <span
                                  className="rounded-full border-2 border-black flex items-center justify-center font-bold text-white shadow"
                                  style={{
                                    width:
                                      40 *
                                      zoom,

                                    height:
                                      40 *
                                      zoom,

                                    backgroundColor:
                                      SIDE_COLORS[
                                        marker.value
                                      ],
                                  }}
                                >
                                  {
                                    marker.value
                                  }
                                </span>

                              </button>
                            )}

                          </div>
                        );
                      }
                    )
                )}

              </div>

            </div>

          </section>

          {/* ===============================================
              CONTROL PANEL
              =============================================== */}

          <aside className="space-y-4">

            {/* BUTTONS */}

            <section className="bg-white rounded-xl shadow p-4">

              <div className="space-y-2">

                <button
                  onClick={newShoe}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-semibold"
                >
                  New Shoe (Full)
                </button>

                <button
                  onClick={nextHand}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 font-semibold"
                >
                  Step Next Hand
                </button>

                <button
                  onClick={resetView}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white rounded-lg py-2 font-semibold"
                >
                  Reset View
                </button>

                <button
                  onClick={
                    exportPerHandCSV
                  }
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 font-semibold"
                >
                  Export per-hand CSV
                </button>

                <button
                  onClick={
                    exportSummaryCSV
                  }
                  className="w-full bg-green-700 hover:bg-green-800 text-white rounded-lg py-2 font-semibold"
                >
                  Export Summary CSV
                </button>

              </div>

            </section>

            {/* ZOOM */}

            <section className="bg-white rounded-xl shadow p-4">

              <h2 className="font-bold mb-3">
                View / Zoom
              </h2>

              <div className="flex gap-2">

                <button
                  onClick={() =>
                    setZoom(
                      Math.min(
                        3,
                        zoom * 1.2
                      )
                    )
                  }
                  className="flex-1 border rounded-lg py-2"
                >
                  Zoom In
                </button>

                <button
                  onClick={() =>
                    setZoom(
                      Math.max(
                        0.3,
                        zoom / 1.2
                      )
                    )
                  }
                  className="flex-1 border rounded-lg py-2"
                >
                  Zoom Out
                </button>

              </div>

              <div className="mt-3 text-sm text-gray-600">
                Zoom:{" "}
                {zoom.toFixed(2)}×
              </div>

            </section>

            {/* LEGEND */}

            <section className="bg-white rounded-xl shadow p-4">

              <h2 className="font-bold mb-3">
                Zone Legend
              </h2>

              <div className="flex flex-wrap gap-2">

                {Object.keys(
                  ZONE_COLORS
                ).map((zone) => (
                  <span
                    key={zone}
                    className="px-2 py-1 rounded text-xs text-white"
                    style={{
                      backgroundColor:
                        ZONE_COLORS[
                          zone
                        ],
                    }}
                  >
                    {zone}
                  </span>
                ))}

              </div>

            </section>

          </aside>

        </div>

        {/* =================================================
            SUMMARY
            ================================================= */}

        <section className="mt-4 bg-white rounded-xl shadow p-4">

          <h2 className="text-lg font-bold mb-4">
            Shoe Summary
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

            <SummaryCard
              title="Cut Target"
              value={
                shoe.summary
                  .target_resolved
              }
            />

            <SummaryCard
              title="Total Hands"
              value={
                shoe.summary
                  .total_hands
              }
            />

            <SummaryCard
              title="Banker"
              value={`${shoe.summary.total_banker} (${shoe.summary.pct_banker}%)`}
            />

            <SummaryCard
              title="Player"
              value={`${shoe.summary.total_player} (${shoe.summary.pct_player}%)`}
            />

            <SummaryCard
              title="Tie"
              value={`${shoe.summary.total_tie} (${shoe.summary.pct_tie}%)`}
            />

            <SummaryCard
              title="A%"
              value={
                shoe.summary.A_full
              }
            />

            <SummaryCard
              title="Longest Run"
              value={
                shoe.summary
                  .longest_run_full
              }
            />

            <SummaryCard
              title="Entropy"
              value={
                shoe.summary
                  .entropy_full
              }
            />

            <SummaryCard
              title="SV"
              value={
                shoe.summary.SV_full
              }
            />

            <SummaryCard
              title="DV"
              value={
                shoe.summary.DV_full
              }
            />

            <SummaryCard
              title="2-2 Blocks"
              value={
                shoe.summary
                  .blocks_2_2_full
              }
            />

            <SummaryCard
              title="3-2 Blocks"
              value={
                shoe.summary
                  .blocks_3_2_full
              }
            />

            <SummaryCard
              title="2-3 Blocks"
              value={
                shoe.summary
                  .blocks_2_3_full
              }
            />

            <SummaryCard
              title="3-3 Blocks"
              value={
                shoe.summary
                  .blocks_3_3_full
              }
            />

          </div>

          {/* =================================================
              ZONE PERCENTAGES
              ================================================= */}

          <div className="mt-5">

            <h3 className="font-bold mb-2">
              Zone Percentages
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">

              <ZonePercentage
                name="zigzag"
                value={
                  shoe.summary
                    .pct_zone_zigzag
                }
              />

              <ZonePercentage
                name="trend-mix"
                value={
                  shoe.summary
                    .pct_zone_trend_mix
                }
              />

              <ZonePercentage
                name="streak"
                value={
                  shoe.summary
                    .pct_zone_streak
                }
              />

              <ZonePercentage
                name="flip"
                value={
                  shoe.summary
                    .pct_zone_flip
                }
              />

              <ZonePercentage
                name="noise"
                value={
                  shoe.summary
                    .pct_zone_noise
                }
              />

              <ZonePercentage
                name="dominance"
                value={
                  shoe.summary
                    .pct_zone_dominance
                }
              />

            </div>

          </div>

          {/* =================================================
              ENTRY CANDIDATES
              ================================================= */}

          <div className="mt-5">

            <h3 className="font-bold mb-2">
              Entry Candidates — First 10
            </h3>

            {shoe.entry_candidates
              .slice(0, 10)
              .map(
                (
                  entry,
                  index
                ) => (
                  <div
                    key={index}
                    className="text-sm border-b py-2"
                  >
                    Hand{" "}
                    {
                      entry.entry_idx +
                      1
                    }

                    {" ← "}

                    Trigger{" "}
                    {
                      entry.trigger_idx +
                      1
                    }

                    {" | "}

                    {
                      entry.reason
                    }

                    {" | side="}

                    {
                      entry.suggest_side
                    }
                  </div>
                )
              )}

          </div>

        </section>

      </main>

      {/* =================================================
          DETAIL MODAL
          ================================================= */}

      {showDetails &&
        selectedHand && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">

            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-auto">

              <div className="p-4 border-b flex justify-between items-center">

                <div>

                  <h2 className="text-xl font-bold">
                    Hand{" "}
                    {
                      selectedHand.hand_index
                    }

                    {" — Result: "}

                    {
                      selectedHand.result
                    }
                  </h2>

                  <div
                    className="mt-1 text-sm font-semibold"
                    style={{
                      color:
                        ZONE_COLORS[
                          selectedHand
                            .zone
                        ],
                    }}
                  >
                    Zone:{" "}
                    {
                      selectedHand.zone
                    }
                  </div>

                </div>

                <button
                  onClick={() =>
                    setShowDetails(
                      false
                    )
                  }
                  className="text-2xl px-2"
                  aria-label="Close"
                >
                  ×
                </button>

              </div>

              <div className="p-4 space-y-4">

                {/* WINDOW */}

                <div>

                  <h3 className="font-bold">
                    Window sequence
                    (most recent last)
                  </h3>

                  <div className="mt-2 p-3 bg-gray-100 rounded-lg font-mono text-sm break-words">
                    {
                      selectedHand.window.join(
                        ", "
                      )
                    }
                  </div>

                </div>

                {/* METRICS */}

                <div className="grid grid-cols-2 gap-2">

                  <Metric
                    name="A"
                    value={
                      selectedHand.A
                    }
                  />

                  <Metric
                    name="SV"
                    value={
                      selectedHand.SV
                    }
                  />

                  <Metric
                    name="DV"
                    value={
                      selectedHand.DV
                    }
                  />

                  <Metric
                    name="Entropy"
                    value={
                      selectedHand.entropy
                    }
                  />

                  <Metric
                    name="Longest Run"
                    value={
                      selectedHand.longest_run
                    }
                  />

                  <Metric
                    name="2-2"
                    value={
                      selectedHand.blocks_2_2
                    }
                  />

                  <Metric
                    name="3-2"
                    value={
                      selectedHand.blocks_3_2
                    }
                  />

                  <Metric
                    name="2-3"
                    value={
                      selectedHand.blocks_2_3
                    }
                  />

                  <Metric
                    name="3-3"
                    value={
                      selectedHand.blocks_3_3
                    }
                  />

                </div>

                {/* SUGGESTION */}

                <div className="border rounded-lg p-3">

                  <h3 className="font-bold">
                    Betting Suggestion
                  </h3>

                  <div className="mt-2 space-y-1 text-sm">

                    <div>
                      Action:{" "}
                      <strong>
                        {
                          selectedHand
                            .suggest_action
                        }
                      </strong>
                    </div>

                    <div>
                      Side:{" "}
                      <strong>
                        {
                          selectedHand
                            .suggest_side ??
                          "—"
                        }
                      </strong>
                    </div>

                    <div>
                      Unit:{" "}
                      <strong>
                        {
                          selectedHand
                            .suggest_unit
                        }
                      </strong>
                    </div>

                    <div>
                      Style:{" "}
                      {
                        selectedHand
                          .suggest_style
                      }
                    </div>

                    <div>
                      Reason:{" "}
                      {
                        selectedHand
                          .suggest_reason
                      }
                    </div>

                  </div>

                </div>

              </div>

              <div className="p-4 border-t">

                <button
                  onClick={() =>
                    setShowDetails(
                      false
                    )
                  }
                  className="w-full bg-gray-700 text-white rounded-lg py-2"
                >
                  Close
                </button>

              </div>

            </div>

          </div>
        )}

    </div>
  );
}

/* =========================================================
   SMALL UI COMPONENTS
   ========================================================= */

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-3 bg-gray-50">

      <div className="text-xs text-gray-500">
        {title}
      </div>

      <div className="text-lg font-bold mt-1">
        {value}
      </div>

    </div>
  );
}

function ZonePercentage({
  name,
  value,
}: {
  name: string;
  value: number;
}) {
  return (
    <div className="border rounded-lg p-2 flex justify-between">

      <span className="font-medium">
        {name}
      </span>

      <span>
        {value}%
      </span>

    </div>
  );
}

function Metric({
  name,
  value,
}: {
  name: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-2">

      <div className="text-xs text-gray-500">
        {name}
      </div>

      <div className="font-semibold">
        {value}
      </div>

    </div>
  );
}


