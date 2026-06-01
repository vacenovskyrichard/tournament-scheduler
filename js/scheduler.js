'use strict';

// ─── Match formats ─────────────────────────────────────────────────────────
// sortPriority: 1 = primary, 2 = good when time allows, 3 = speed option, 5 = last resort
const MATCH_FORMATS = [
  {
    id: 'sets2_15_tb10',
    name: '2 sety do 15 + tiebreak do 10',
    shortName: '2×15 + TB10',
    duration: 30,
    preferred: true,
    sortPriority: 1,
    rules: '2 sety do 15 bodů. Při 1:1 tiebreak do 10. Vždy rozdíl 2 bodů.',
  },
  {
    id: 'sets2_15_tb15',
    name: '2 sety do 15 + tiebreak do 15',
    shortName: '2×15 + TB15',
    duration: 40,
    preferred: true,
    sortPriority: 2,
    rules: '2 sety do 15 bodů. Při 1:1 tiebreak do 15. Vždy rozdíl 2 bodů.',
  },
  {
    id: 'sets2_21',
    name: '2 sety do 21 bodů',
    shortName: '2×21',
    duration: 50,
    preferred: true,
    sortPriority: 2,
    rules: '2 sety do 21 bodů. Při 1:1 tiebreak do 15. Vždy rozdíl 2 bodů.',
  },
  {
    id: 'set1_21',
    name: '1 set do 21 bodů',
    shortName: '1×21',
    duration: 15,
    preferred: true,
    sortPriority: 3,
    rules: '1 set do 21 bodů. Při 20:20 se hraje na rozdíl 2 bodů.',
  },
  {
    id: 'set1_15',
    name: '1 set do 15 bodů',
    shortName: '1×15',
    duration: 10,
    preferred: false,
    sortPriority: 5,
    rules: '1 set do 15 bodů. Při 14:14 se hraje na rozdíl 2 bodů.',
  },
];

const WARMUP_MIN  = 6;
const TRANSITION  = 3;
const PHASE_BREAK = 10;

// ─── Round-robin generator ─────────────────────────────────────────────────
function generateRRRounds(n) {
  const arr = Array.from({ length: n % 2 === 0 ? n : n + 1 }, (_, i) => i);
  if (n % 2 !== 0) arr[n] = -1;
  const N = arr.length;
  const rounds = [];
  const a = [...arr];
  for (let r = 0; r < N - 1; r++) {
    const round = [];
    for (let i = 0; i < N / 2; i++) {
      if (a[i] >= 0 && a[N - 1 - i] >= 0) round.push([a[i], a[N - 1 - i]]);
    }
    if (round.length > 0) rounds.push(round);
    const last = a.pop();
    a.splice(1, 0, last);
  }
  return rounds;
}

function countTimeSlots(rounds, courts) {
  let slots = 0;
  for (const round of rounds) slots += Math.ceil(round.length / courts);
  return slots;
}

function calcTotalMinutes(slots, matchDuration, phaseBreaks) {
  return WARMUP_MIN + slots * (matchDuration + TRANSITION) + phaseBreaks * PHASE_BREAK;
}

// ─── Helper: find best mix of 3-team and 4-team groups ────────────────────
// 3-team groups: full RR → each team plays 2 matches
// 4-team groups: modified format → each team plays 2 matches
// → every team plays exactly 2 group-stage matches
function findGroupMix(N, C) {
  // Modified pool MUST contain at least one 4-team group; otherwise it's just
  // pure RR and is indistinguishable from `pool_knockout`.
  // Priority: 1) numGroups == courts (each group gets its own court)
  //           2) fewer 4-team groups (simpler seeding)
  const candidates = [];

  for (let g3 = Math.floor(N / 3); g3 >= 0; g3--) {
    const rem = N - 3 * g3;
    if (rem >= 0 && rem % 4 === 0) {
      const g4    = rem / 4;
      const total = g3 + g4;
      if (total >= 2 && g4 >= 1) {
        candidates.push({ g3, g4, totalGroups: total });
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const score = o =>
        Math.abs(o.totalGroups - C) * 2          // prefer groups == courts
      + (o.totalGroups % 2 === 0 ? 0 : 2)        // penalise odd group counts
      + o.g4 * 0.5;                              // mild preference for simpler 3-team groups
    return score(a) - score(b);
  });

  return candidates[0];
}

// ─── Knockout slots helper ─────────────────────────────────────────────────
// Counts timeslots for a single-elim bracket of `teams` players with byes
// (Předkolo when teams isn't a power of 2) + a 3rd-place playoff.
function calcKnockoutSlots(teams, courts) {
  if (teams <= 1) return 0;
  const B   = Math.pow(2, Math.ceil(Math.log2(teams)));
  const bye = B - teams;
  let slots = 0;
  const r1Real = B / 2 - bye;
  if (r1Real > 0) slots += Math.ceil(r1Real / courts);
  let t = bye + r1Real;
  while (t > 1) {
    slots += Math.ceil((t / 2) / courts);
    t /= 2;
  }
  if (teams >= 4) slots += 1; // 3rd place
  return slots;
}

// ─── Seeding helpers ──────────────────────────────────────────────────────
// Standard tennis bracket seed order: result[i] = seed at slot i (1-indexed)
function bracketSeedOrder(B) {
  if (B === 1) return [1];
  const prev = bracketSeedOrder(B / 2);
  const out  = [];
  for (const s of prev) {
    out.push(s);
    out.push(B + 1 - s);
  }
  return out;
}

// Build feeder labels in seed order: all "1st from group X", then all "2nd", etc.
function generateSeedLabels(groupLabels, poolSizes) {
  const maxRank = Math.max(...poolSizes);
  const seeds = [];
  for (let r = 1; r <= maxRank; r++) {
    for (let g = 0; g < groupLabels.length; g++) {
      if (r <= poolSizes[g]) seeds.push(`${r}. Sk.${groupLabels[g]}`);
    }
  }
  return seeds;
}

// ─── 1. Skupiny + Pavouk (Standard pool play + knockout) ──────────────────
function calcPoolKnockout(N, C, fmt) {
  if (N < 6) return null;

  // Pick numPools by trade-off between:
  //  • numGroups == courts (so each group has its own court)
  //  • even number of groups (cleaner bracket structure)
  //  • balanced group sizes
  //  • not-too-large groups (>4 makes the pool stage drag on)
  // We don't force "groups == courts" — e.g. 12 teams on 5 courts should still
  // suggest 4 groups (4×3), not 5 odd groups.
  let numPools = 2, bestScore = Infinity;
  for (let np = 2; np <= Math.min(Math.floor(N / 2), 8); np++) {
    const minSz = Math.floor(N / np);
    const maxSz = Math.ceil(N / np);
    if (minSz < 3) break;       // pools too small
    if (maxSz > 6) continue;    // pools too big
    const score =
        Math.abs(np - C) * 2              // prefer groups == courts
      + (np % 2 === 0 ? 0 : 1)            // mild penalty for odd group counts
      + (maxSz - minSz) * 3               // penalise unequal sizes
      + Math.max(0, maxSz - 4) * 3;       // penalise pools larger than 4
    if (score < bestScore) { bestScore = score; numPools = np; }
  }

  const sizes = [];
  for (let i = 0; i < numPools; i++) {
    sizes.push(i < N % numPools ? Math.ceil(N / numPools) : Math.floor(N / numPools));
  }
  const poolRounds = sizes.map(s => generateRRRounds(s));
  const maxRounds  = Math.max(...poolRounds.map(r => r.length));
  let poolSlots = 0;
  for (let r = 0; r < maxRounds; r++) {
    let matchesThisRound = 0;
    for (const pr of poolRounds) {
      if (r < pr.length) matchesThisRound += pr[r].length;
    }
    poolSlots += Math.ceil(matchesThisRound / C);
  }
  const advancers = N;                                  // all teams advance
  const koSlots   = calcKnockoutSlots(advancers, C);
  const totalSlots = poolSlots + koSlots;
  const poolMatches = sizes.reduce((s, p) => s + p * (p - 1) / 2, 0);
  const B           = Math.pow(2, Math.ceil(Math.log2(advancers)));
  const koMatches   = (B - 1) + (advancers >= 4 ? 1 : 0); // single-elim + 3rd place
  const minPool = Math.min(...sizes) - 1;
  const maxPool = Math.max(...sizes) - 1;
  const bracketDepth = Math.ceil(Math.log2(B));         // wins needed to reach final
  return {
    id: `pool_ko_${fmt.id}`,
    type: 'pool_knockout',
    name: `Skupiny (${numPools}) + Pavouk`,
    desc: `${numPools} skupiny, každá hraje každý s každým. Všechny týmy pak postupují do pavouka (nasazení podle pořadí ve skupině).`,
    matchFormat: fmt,
    totalMatches: poolMatches + koMatches,
    timeSlots: totalSlots,
    estimatedMinutes: calcTotalMinutes(totalSlots, fmt.duration, 1),
    minMatchesPerTeam: minPool + 1,                     // RR matches + at least one KO
    maxMatchesPerTeam: maxPool + bracketDepth + 1,      // +1 = possible 3rd-place game
    phaseBreaks: 1,
    poolSizes: sizes,
    poolRounds,
    numPools,
    advancers,
  };
}

// ─── 2. Modifikované skupiny + Pavouk ─────────────────────────────────────
// Mixed groups of 3 (full RR) and 4 (modified: 1v4, 2v3 → WvW, LvL)
// Each team plays exactly 2 group matches regardless of group type
function calcModifiedPool(N, C, fmt) {
  const mix = findGroupMix(N, C);
  if (!mix) return null;

  const { g3, g4, totalGroups } = mix;

  // Parallel scheduling across courts:
  // Round 1 : 4-team groups → 2 matches each;  3-team groups → 1 match each
  // Round 2 : 4-team groups → 2 matches each;  3-team groups → 1 match each
  // Round 3 : only 3-team groups (last RR match) → 1 match each
  const r1 = 2 * g4 + g3;
  const r2 = 2 * g4 + g3;
  const r3 = g3;
  const groupSlots = Math.ceil(r1 / C) + Math.ceil(r2 / C) + (r3 > 0 ? Math.ceil(r3 / C) : 0);

  const advancers  = N;                                 // all teams advance
  const koSlots    = calcKnockoutSlots(advancers, C);
  const totalSlots = groupSlots + koSlots;

  const groupMatches = 3 * g3 + 4 * g4; // RR for 3-team, modified 4-match for 4-team
  const B            = Math.pow(2, Math.ceil(Math.log2(advancers)));
  const koMatches    = (B - 1) + (advancers >= 4 ? 1 : 0);

  let name, desc;
  if (g4 === 0) {
    name = `Skupiny (${g3}×3) + Pavouk`;
    desc = `${g3} skupiny po 3 týmech, každý s každým. Každý tým hraje 2 skupinové zápasy. Všichni pak postupují do pavouka.`;
  } else if (g3 === 0) {
    name = `Mod. skupiny (${g4}×4) + Pavouk`;
    desc = `${g4} skupiny po 4 týmech — mod. formát (1.vs4., 2.vs3., pak vítěz vs vítěz). Každý hraje 2 zápasy. Všichni pak postupují do pavouka.`;
  } else {
    name = `Skupiny (${g4}×4 mod. + ${g3}×3 RR) + Pavouk`;
    desc = `${g4}× sk. po 4 (mod. formát) + ${g3}× sk. po 3 (každý s každým). Každý hraje 2 skupinové zápasy. Všichni pak postupují do pavouka.`;
  }

  return {
    id: `mod_pool_${fmt.id}`,
    type: 'modified_pool',
    name,
    desc,
    matchFormat: fmt,
    totalMatches: groupMatches + koMatches,
    timeSlots: totalSlots,
    estimatedMinutes: calcTotalMinutes(totalSlots, fmt.duration, 1),
    minMatchesPerTeam: 2 + 1,
    maxMatchesPerTeam: 2 + Math.ceil(Math.log2(Math.max(B, 2))) + 1,
    phaseBreaks: 1,
    numGroups: totalGroups,
    g3,
    g4,
    advancers,
  };
}

// ─── 3. 2ko Pavouk (Double Elimination) ───────────────────────────────────
function calcDoubleElim(N, C, fmt) {
  if (N < 4) return null;
  const B = Math.pow(2, Math.ceil(Math.log2(N)));
  const wbRounds = Math.log2(B);
  const lbRounds = 2 * (wbRounds - 1);
  let totalSlots = 0;
  let wbTeams = B;
  for (let r = 0; r < wbRounds; r++) {
    if (r === 0) {
      const r1Matches = N - B / 2;
      if (r1Matches > 0) totalSlots += Math.ceil(r1Matches / C);
    } else {
      totalSlots += Math.ceil((wbTeams / 2) / C);
    }
    wbTeams /= 2;
  }
  let lbTeams = B / 2;
  for (let r = 0; r < lbRounds; r++) {
    const matches = lbTeams / 2;
    totalSlots += Math.ceil(matches / C);
    if (r % 2 === 1) lbTeams /= 2;
  }
  totalSlots += 1; // Grand Final
  const totalMatches = 2 * N - 1;
  return {
    id: `double_elim_${fmt.id}`,
    type: 'double_elimination',
    name: '2ko Pavouk',
    desc: 'Každý tým musí prohrát dvakrát, než je vyřazen. Po první prohře jdete do losers bracket.',
    matchFormat: fmt,
    totalMatches,
    timeSlots: totalSlots,
    estimatedMinutes: calcTotalMinutes(totalSlots, fmt.duration, 0),
    minMatchesPerTeam: 2,
    maxMatchesPerTeam: wbRounds + lbRounds + 1,
    phaseBreaks: 0,
    bracketSize: B,
    byes: B - N,
    wbRounds,
    lbRounds,
  };
}

// ─── 4. Každý s každým (Round Robin, max 5 teams) ─────────────────────────
function calcRoundRobin(N, C, fmt) {
  if (N < 3 || N > 5) return null;
  const rounds = generateRRRounds(N);
  const slots  = countTimeSlots(rounds, C);
  return {
    id: `rr_${fmt.id}`,
    type: 'round_robin',
    name: 'Každý s každým',
    desc: 'Všechny týmy hrají každý s každým. Doporučeno pro max. 5 týmů. Pořadí určuje počet výher a skóre.',
    matchFormat: fmt,
    totalMatches: N * (N - 1) / 2,
    timeSlots: slots,
    estimatedMinutes: calcTotalMinutes(slots, fmt.duration, 0),
    minMatchesPerTeam: N - 1,
    maxMatchesPerTeam: N - 1,
    phaseBreaks: 0,
    rrRounds: rounds,
  };
}

// ─── 5. Swiss System (online only) ────────────────────────────────────────
function calcSwiss(N, C, fmt) {
  if (N < 4) return null;
  const rounds = Math.ceil(Math.log2(N)) + (N > 8 ? 1 : 0);
  const matchesPerRound = Math.floor(N / 2);
  const slotsPerRound   = Math.ceil(matchesPerRound / C);
  const totalSlots      = rounds * slotsPerRound;
  return {
    id: `swiss_${fmt.id}`,
    type: 'swiss',
    name: 'Swiss systém',
    desc: `${rounds} kol. Každé kolo páruje týmy se stejným počtem výher. Nikdo nevypadá. Pouze pro online zápis.`,
    matchFormat: fmt,
    totalMatches: rounds * matchesPerRound,
    timeSlots: totalSlots,
    estimatedMinutes: calcTotalMinutes(totalSlots, fmt.duration, 0),
    minMatchesPerTeam: rounds,
    maxMatchesPerTeam: rounds,
    phaseBreaks: 0,
    swissRounds: rounds,
    onlineOnly: true,
  };
}

// ─── Generate all feasible options ────────────────────────────────────────
function generateOptions(teamNames, courts, startTime, endTime, onlineMode) {
  const N = teamNames.length;
  const available = Math.round((endTime - startTime) / 60000);

  const calcs = [
    calcPoolKnockout,
    calcModifiedPool,
    calcDoubleElim,
    calcRoundRobin,
    (n, c, f) => onlineMode ? calcSwiss(n, c, f) : null,
  ];

  const raw = [];
  for (const fmt of MATCH_FORMATS) {
    for (const calc of calcs) {
      const opt = calc(N, courts, fmt);
      if (!opt) continue;
      if (opt.onlineOnly && !onlineMode) continue;
      if (opt.estimatedMinutes > available * 1.04) continue;
      raw.push({
        ...opt,
        availableMinutes: available,
        fitnessScore: opt.estimatedMinutes / available,
        tournamentName: opt.name,
        tournamentDesc: opt.desc,
        tournamentType: opt.type,
      });
    }
  }

  raw.sort((a, b) => {
    const fmtBonus = o => {
      const p = o.matchFormat.sortPriority;
      if (p === 1) return 0.12;   // 2×15+TB10: primary preferred
      if (p === 2) return 0.08;   // 2×15+TB15, 2×21: good with time
      if (p === 3) return 0.04;   // 1×21: speed option
      return -0.20;               // 1×15: last resort
    };
    // Penalise tournaments whose group count doesn't match the available courts —
    // we want one group per court when possible (e.g. 4 courts → 4 groups, not 3).
    const groupsOf = o =>
      o.tournamentType === 'pool_knockout' ? o.numPools
    : o.tournamentType === 'modified_pool' ? o.numGroups
    : null;
    const courtMismatch = o => {
      const g = groupsOf(o);
      return g == null ? 0 : Math.abs(g - courts) * 0.08;
    };
    const penalty = o => (o.fitnessScore < 0.45 ? 0.5 : 0) + courtMismatch(o);
    const da = Math.abs(a.fitnessScore + fmtBonus(a) - 1) + penalty(a);
    const db = Math.abs(b.fitnessScore + fmtBonus(b) - 1) + penalty(b);
    return da - db;
  });

  // Hide 1×15 if any better format fits — it's a true last resort
  const hasBetter = raw.some(o => o.matchFormat.sortPriority < 5);
  return hasBetter ? raw.filter(o => o.matchFormat.sortPriority < 5) : raw;
}

// ─── Schedule builder ──────────────────────────────────────────────────────
function buildSchedule(option, teamNames, courts, startTime) {
  const slotMs  = (option.matchFormat.duration + TRANSITION) * 60000;
  const phaseMs = PHASE_BREAK * 60000;
  let   cursor  = new Date(startTime.getTime() + WARMUP_MIN * 60000);
  let   matchId = 1;
  const schedule = [];

  function pushSlot(matchPairs, roundName, phase, koLabels) {
    for (let i = 0; i < matchPairs.length; i += courts) {
      const batch = matchPairs.slice(i, i + courts);
      batch.forEach((pair, ci) => {
        schedule.push({
          id: matchId++,
          time: new Date(cursor),
          court: ci + 1,
          team1Label: pair[0],
          team2Label: pair[1],
          roundName,
          phase,
          koLabel: koLabels ? koLabels[i + ci] : null,
          score1: '',
          score2: '',
        });
      });
      cursor = new Date(cursor.getTime() + slotMs);
    }
  }

  const t = teamNames;

  // ── Round Robin ──────────────────────────────────────────────────────────
  if (option.type === 'round_robin') {
    option.rrRounds.forEach((round, ri) => {
      pushSlot(round.map(([a, b]) => [t[a], t[b]]), `Kolo ${ri + 1}`, 'pool');
    });
  }

  // ── Standard Pool + Knockout ─────────────────────────────────────────────
  if (option.type === 'pool_knockout') {
    const { poolSizes, poolRounds, numPools } = option;
    const poolLabels = ['A', 'B', 'C', 'D'];
    const poolTeams  = [];
    let idx = 0;
    for (let p = 0; p < numPools; p++) {
      const arr = [];
      for (let i = 0; i < poolSizes[p]; i++) arr.push(t[idx++]);
      poolTeams.push(arr);
    }
    const maxRounds = Math.max(...poolRounds.map(r => r.length));
    for (let r = 0; r < maxRounds; r++) {
      const combined = [];
      for (let p = 0; p < numPools; p++) {
        if (r < poolRounds[p].length) {
          for (const [a, b] of poolRounds[p][r]) {
            combined.push([poolTeams[p][a], poolTeams[p][b]]);
          }
        }
      }
      pushSlot(combined, `Skupiny — kolo ${r + 1}`, 'pool');
    }
    cursor = new Date(cursor.getTime() + phaseMs);
    // Knockout: ALL teams advance, seeded by group rank
    const gl = poolLabels.slice(0, numPools);
    const seedLabels = generateSeedLabels(gl, poolSizes);
    pushKnockout(seedLabels, pushSlot);
  }

  // ── Modified Pool (mixed 3-team RR + 4-team modified) + Knockout ─────────
  if (option.type === 'modified_pool') {
    const { g3, g4, numGroups } = option;
    const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    // Assign teams: 4-team groups first, then 3-team groups
    const groups = [];
    let idx = 0;
    for (let g = 0; g < g4; g++) {
      groups.push({ size: 4, label: groupLabels[g], teams: t.slice(idx, idx + 4), rrRounds: null });
      idx += 4;
    }
    for (let g = 0; g < g3; g++) {
      const lbl     = groupLabels[g4 + g];
      const grpTeams = t.slice(idx, idx + 3);
      groups.push({ size: 3, label: lbl, teams: grpTeams, rrRounds: generateRRRounds(3) });
      idx += 3;
    }

    // Round 1: 4-team → 1v4, 2v3 | 3-team → first RR match
    const r1 = [];
    for (const grp of groups) {
      if (grp.size === 4) {
        r1.push([grp.teams[0], grp.teams[3]]);
        r1.push([grp.teams[1], grp.teams[2]]);
      } else {
        const [a, b] = grp.rrRounds[0][0];
        r1.push([grp.teams[a], grp.teams[b]]);
      }
    }
    pushSlot(r1, 'Skupiny — kolo 1', 'pool');

    // Round 2: 4-team → WvW, LvL | 3-team → second RR match
    const r2 = [];
    for (const grp of groups) {
      if (grp.size === 4) {
        r2.push([`Vít. M1 sk.${grp.label}`, `Vít. M2 sk.${grp.label}`]);
        r2.push([`Por. M1 sk.${grp.label}`, `Por. M2 sk.${grp.label}`]);
      } else if (grp.rrRounds.length > 1) {
        const [a, b] = grp.rrRounds[1][0];
        r2.push([grp.teams[a], grp.teams[b]]);
      }
    }
    pushSlot(r2, 'Skupiny — kolo 2', 'pool');

    // Round 3: 3-team groups only (last RR match)
    if (g3 > 0) {
      const r3 = [];
      for (const grp of groups) {
        if (grp.size === 3 && grp.rrRounds.length > 2) {
          const [a, b] = grp.rrRounds[2][0];
          r3.push([grp.teams[a], grp.teams[b]]);
        }
      }
      if (r3.length > 0) pushSlot(r3, 'Skupiny — kolo 3', 'pool');
    }

    cursor = new Date(cursor.getTime() + phaseMs);

    const gl    = groups.map(g => g.label);
    const sizes = groups.map(g => g.size);
    const seedLabels = generateSeedLabels(gl, sizes);
    pushKnockout(seedLabels, pushSlot);
  }

  // ── Double Elimination ───────────────────────────────────────────────────
  if (option.type === 'double_elimination') {
    const B = option.bracketSize;
    const padded = [...teamNames, ...Array(option.byes).fill(null)];

    const wbR1 = [];
    for (let i = 0; i < B / 2; i++) {
      const a = padded[i], b = padded[B - 1 - i];
      if (a && b) wbR1.push([a, b]);
    }
    if (wbR1.length > 0) {
      const name = B === 4 ? 'WB Semifinále' : B === 8 ? 'WB Čtvrtfinále' : 'WB 1. kolo';
      pushSlot(wbR1, name, 'bracket');
    }

    let wbTeams = B / 2;
    let lbTeams = wbR1.length;
    let mc = wbR1.length + 1;

    if (lbTeams >= 2) {
      const lbR1 = [];
      for (let i = 0; i < lbTeams; i += 2) lbR1.push([`LB: Por.${mc + i}`, `LB: Por.${mc + i + 1}`]);
      pushSlot(lbR1, 'LB 1. kolo', 'losers');
      mc += lbTeams;
    }

    for (let r = 1; r < option.wbRounds; r++) {
      const wbMatches = [];
      for (let i = 0; i < wbTeams / 2; i++) {
        wbMatches.push([`WB Vít.${mc + i * 2}`, `WB Vít.${mc + i * 2 + 1}`]);
      }
      const rName = wbTeams === 2 ? 'WB Finále' : wbTeams === 4 ? 'WB Semifinále' : `WB ${r + 1}. kolo`;
      pushSlot(wbMatches, rName, 'bracket');
      mc += wbTeams;

      const lbMatches = [];
      for (let i = 0; i < wbTeams / 2; i += 2) {
        lbMatches.push([`LB Vít.${mc + i}`, `WB Por.${mc + i + 1}`]);
      }
      if (lbMatches.length > 0) pushSlot(lbMatches, `LB ${r * 2}. kolo`, 'losers');
      mc += wbTeams / 2;
      wbTeams /= 2;
    }

    pushSlot([['LB Finalista', 'LB Semifinalista']], 'LB Finále', 'losers');
    pushSlot([['WB Vítěz', 'LB Vítěz']], 'Grand Finále', 'final');
  }

  // ── Swiss ────────────────────────────────────────────────────────────────
  if (option.type === 'swiss') {
    const n    = teamNames.length;
    const half = Math.floor(n / 2);
    for (let r = 0; r < option.swissRounds; r++) {
      const round = [];
      if (r === 0) {
        for (let i = 0; i < half; i++) round.push([t[i], t[i + half]]);
        if (n % 2 !== 0) round.push([t[n - 1], 'BYE']);
      } else {
        for (let i = 0; i < half; i++) {
          round.push([`Swiss Vít./Por. ${2 * i + 1}`, `Swiss Vít./Por. ${2 * i + 2}`]);
        }
      }
      pushSlot(round, `Swiss — kolo ${r + 1}`, 'pool');
    }
  }

  return schedule;
}

// ─── Knockout schedule (used by pool_knockout + modified_pool) ─────────────
// Builds a single-elimination bracket where ALL `seedLabels` enter, using
// standard tennis seeding so top seeds meet last. Phantom seeds (rank > N)
// become byes that auto-advance into the next round.
function pushKnockout(seedLabels, pushSlot) {
  const N = seedLabels.length;
  if (N <= 1) return;
  if (N === 2) {
    pushSlot([[seedLabels[0], seedLabels[1]]], 'Finále', 'final');
    return;
  }

  const B          = Math.pow(2, Math.ceil(Math.log2(N)));
  const bye        = B - N;
  const seedOrder  = bracketSeedOrder(B);            // seed numbers per bracket slot
  const labelOf    = s => (s <= N ? seedLabels[s - 1] : null);

  // Round-1 pairs (B/2). A pair with a null slot is a bye.
  const r1Pairs = [];
  for (let i = 0; i < B; i += 2) {
    r1Pairs.push([labelOf(seedOrder[i]), labelOf(seedOrder[i + 1])]);
  }
  const r1Real = r1Pairs.filter(p => p[0] && p[1]).length;

  // Pick round name based on total team count entering that round.
  const nameForRound = (teamsIn) => {
    if (teamsIn === 2)  return 'Finále';
    if (teamsIn === 4)  return 'Semifinále';
    if (teamsIn === 8)  return 'Čtvrtfinále';
    if (teamsIn === 16) return 'Osmifinále';
    if (teamsIn === 32) return '1/16 finále';
    return `Kolo ${Math.log2(teamsIn)}`;
  };

  // ── R1: Předkolo (if there are byes) or the main first round (no byes) ──
  let pCounter = 0;
  let nextRoundFeeders = []; // length B/2 — feeder label entering bracket slot i in R2
  if (r1Real > 0 && bye > 0) {
    const preMatches = [];
    const preLabels  = [];
    for (let i = 0; i < B / 2; i++) {
      const [a, b] = r1Pairs[i];
      if (a && b) {
        pCounter++;
        preMatches.push([a, b]);
        preLabels.push(`P${pCounter}`);
        nextRoundFeeders.push(`Vít. P${pCounter}`);
      } else {
        nextRoundFeeders.push(a || b);   // bye: solo seed auto-advances
      }
    }
    pushSlot(preMatches, 'Předkolo', 'semifinal', preLabels);
  } else if (r1Real === B / 2) {
    // No byes: R1 is the full first round (e.g. Osmifinále for B=16).
    const matches = [];
    const labels  = [];
    const r1Name  = nameForRound(B);
    for (let i = 0; i < B / 2; i++) {
      pCounter++;
      matches.push(r1Pairs[i]);
      labels.push(`P${pCounter}`);
      nextRoundFeeders.push(`Vít. P${pCounter}`);
    }
    pushSlot(matches, r1Name, 'semifinal', labels);
  } else {
    // Degenerate: all-bye R1 (shouldn't happen for N >= 2).
    nextRoundFeeders = r1Pairs.map(p => p[0] || p[1]);
  }

  // ── Round structure after R1 ──
  let teamsNextRound = nextRoundFeeders.length; // = B/2
  let curFeeders     = nextRoundFeeders;

  while (teamsNextRound > 1) {
    const matchesCount = teamsNextRound / 2;
    const roundName    = nameForRound(teamsNextRound);
    const phase        = matchesCount === 1 ? 'final' : 'semifinal';

    // 3rd-place playoff right before Finále (only if semis had 2 matches)
    if (matchesCount === 1 && teamsNextRound === 2 && curFeeders.length === 2) {
      const wasSemi = curFeeders.every(f => /^Vít\. SF/.test(String(f || '')));
      if (wasSemi) {
        pushSlot([['Por. SF 1', 'Por. SF 2']], 'O 3. místo', 'final', ['F3']);
      }
    }

    const matches    = [];
    const labels     = [];
    const nextFeeder = [];
    for (let i = 0; i < curFeeders.length; i += 2) {
      matches.push([curFeeders[i], curFeeders[i + 1]]);
      if (matchesCount === 1) {
        labels.push(roundName === 'Finále' ? 'F1' : 'F1');
        nextFeeder.push(null);
      } else if (matchesCount === 2) {
        const n = (i / 2) + 1;
        labels.push(`SF${n}`);
        nextFeeder.push(`Vít. SF${n}`);
      } else {
        pCounter++;
        labels.push(`P${pCounter}`);
        nextFeeder.push(`Vít. P${pCounter}`);
      }
    }
    pushSlot(matches, roundName, phase, labels);

    curFeeders     = nextFeeder;
    teamsNextRound = matchesCount;
  }
}

// ─── Swiss pairing (for online mode live pairing) ─────────────────────────
function swissPairNextRound(standings, history) {
  const sorted = [...standings].sort((a, b) =>
    b.points - a.points || b.buchholz - a.buchholz || a.name.localeCompare(b.name)
  );
  const used  = new Set();
  const pairs = [];
  const historySet = new Set(history.map(([a, b]) => `${a}|${b}`));
  const played = (x, y) => historySet.has(`${x}|${y}`) || historySet.has(`${y}|${x}`);

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    let found = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (!used.has(j) && !played(sorted[i].name, sorted[j].name)) {
        pairs.push([sorted[i].name, sorted[j].name]);
        used.add(i); used.add(j);
        found = true;
        break;
      }
    }
    if (!found) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (!used.has(j)) {
          pairs.push([sorted[i].name, sorted[j].name]);
          used.add(i); used.add(j);
          break;
        }
      }
    }
  }
  if (sorted.length % 2 !== 0) {
    const unmatched = sorted.find((_, i) => !used.has(i));
    if (unmatched) pairs.push([unmatched.name, 'BYE']);
  }
  return pairs;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

function minutesToHHMM(m) {
  const h   = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
}

// ─── Score / sets helpers ──────────────────────────────────────────────────
// Returns the score columns a match needs. Single-set formats use 1 column
// per team, 2-sets + TB formats use 3 (set1, set2, tiebreak).
function setsForFormat(fmtId) {
  return String(fmtId || '').startsWith('set1_') ? 1 : 3;
}

// Determine the winner of a match given the scores object.
//   Returns 1 = team 1 wins, 2 = team 2 wins, 0 = undecided.
// For 2-set formats with score 1-1, looks at the tiebreak (set index 2).
function matchWinner(scores, matchId, fmtId) {
  const sets = setsForFormat(fmtId);
  const get = (team, idx) => {
    const v = scores[`${matchId}_${team}_${idx}`];
    if (v === '' || v == null) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };

  if (sets === 1) {
    const a = get(1, 0), b = get(2, 0);
    if (a == null || b == null) return 0;
    if (a > b) return 1;
    if (b > a) return 2;
    return 0;
  }

  let wA = 0, wB = 0;
  for (let i = 0; i < 2; i++) {
    const a = get(1, i), b = get(2, i);
    if (a == null || b == null) return 0;
    if (a > b) wA++;
    else if (b > a) wB++;
  }
  if (wA === 2) return 1;
  if (wB === 2) return 2;
  // 1-1 → tiebreak decides
  const a = get(1, 2), b = get(2, 2);
  if (a == null || b == null) return 0;
  if (a > b) return 1;
  if (b > a) return 2;
  return 0;
}

// Concise text summary of a finished match (used for KO feeder labels and copy
// text), e.g. "21:18 19:21 10:8" or "21:15" for single sets.
function matchScoreText(scores, matchId, fmtId) {
  const sets = setsForFormat(fmtId);
  const parts = [];
  for (let i = 0; i < sets; i++) {
    const a = scores[`${matchId}_1_${i}`];
    const b = scores[`${matchId}_2_${i}`];
    if (a == null || a === '' || b == null || b === '') continue;
    parts.push(`${a}:${b}`);
  }
  return parts.join(' ');
}
