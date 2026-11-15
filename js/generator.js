/*
 * Puzzle generator + solver.
 *
 * Rules: an N x N grid is split into N colored regions. Place exactly one
 * boxer in every row, every column and every region, and no two boxers may
 * touch — not even diagonally.
 *
 * Every generated puzzle has exactly one solution.
 */
(function (root) {
  'use strict';

  // ---- Seeded RNG -------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // ---- Step 1: a random valid placement (one per row/col, none touching) --
  function placeBoxers(n, rand) {
    const cols = new Array(n);
    const used = new Array(n).fill(false);
    (function bt(r) {
      if (r === n) return true;
      for (const c of shuffle(range(n), rand)) {
        if (used[c]) continue;
        if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
        used[c] = true;
        cols[r] = c;
        if (bt(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return cols;
  }

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function neighbors(n, idx) {
    const r = Math.floor(idx / n), c = idx % n;
    const out = [];
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
    return out;
  }

  // ---- Step 2: grow N connected regions, one seeded on each boxer --------
  function growRegions(n, cols, rand) {
    const regions = new Array(n * n).fill(-1);
    for (let r = 0; r < n; r++) regions[r * n + cols[r]] = r;
    let remaining = n * n - n;
    while (remaining > 0) {
      const frontier = [];
      for (let i = 0; i < n * n; i++) {
        if (regions[i] !== -1) continue;
        const adj = neighbors(n, i).filter((j) => regions[j] !== -1);
        if (adj.length) frontier.push([i, adj]);
      }
      const [cell, adj] = frontier[Math.floor(rand() * frontier.length)];
      regions[cell] = regions[adj[Math.floor(rand() * adj.length)]];
      remaining--;
    }
    return regions;
  }

  // ---- Solver: counts solutions up to `limit` ---------------------------
  function countSolutions(n, regions, limit) {
    const usedCol = new Array(n).fill(false);
    const usedReg = new Array(n).fill(false);
    let count = 0;
    (function bt(r, prev) {
      if (count >= limit) return;
      if (r === n) { count++; return; }
      for (let c = 0; c < n; c++) {
        if (usedCol[c]) continue;
        if (prev >= 0 && Math.abs(prev - c) <= 1) continue;
        const reg = regions[r * n + c];
        if (usedReg[reg]) continue;
        usedCol[c] = usedReg[reg] = true;
        bt(r + 1, c);
        usedCol[c] = usedReg[reg] = false;
        if (count >= limit) return;
      }
    })(0, -1);
    return count;
  }

  // Is region `reg` still connected if `without` is removed from it?
  function regionConnected(n, regions, reg, without) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (regions[i] === reg && i !== without) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const cur = stack.pop();
      for (const nb of neighbors(n, cur)) {
        if (nb !== without && regions[nb] === reg && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    return seen.size === cells.length;
  }

  // ---- Step 3: nudge region borders until the solution is unique ---------
  function makeUnique(n, cols, regions, rand, maxSteps) {
    const LIMIT = 200;
    const isSeed = new Set(range(n).map((r) => r * n + cols[r]));
    let score = countSolutions(n, regions, LIMIT);
    for (let step = 0; step < maxSteps && score > 1; step++) {
      const cell = Math.floor(rand() * n * n);
      if (isSeed.has(cell)) continue;
      const from = regions[cell];
      const options = neighbors(n, cell).map((j) => regions[j]).filter((g) => g !== from);
      if (!options.length) continue;
      if (!regionConnected(n, regions, from, cell)) continue;
      regions[cell] = options[Math.floor(rand() * options.length)];
      const next = countSolutions(n, regions, LIMIT);
      if (next <= score) score = next;
      else regions[cell] = from; // revert
    }
    return score === 1;
  }

  /**
   * Generate a puzzle.
   * @param {number} n   grid size (4..10)
   * @param {number} seed
   * @returns {{n:number, regions:number[], solution:number[]}}
   *   regions: region id per cell (row-major); solution: column of the boxer in each row
   */
  function generate(n, seed) {
    const rand = mulberry32(seed);
    for (let attempt = 0; attempt < 500; attempt++) {
      const cols = placeBoxers(n, rand);
      const regions = growRegions(n, cols, rand);
      if (makeUnique(n, cols, regions, rand, n * n * 12)) {
        return { n, regions: normalizeRegions(n, regions), solution: cols, seed };
      }
    }
    throw new Error('Could not generate puzzle');
  }

  // Renumber regions in reading order so colors look consistent.
  function normalizeRegions(n, regions) {
    const map = new Map();
    return regions.map((g) => {
      if (!map.has(g)) map.set(g, map.size);
      return map.get(g);
    });
  }

  const api = { generate, countSolutions, hashString, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerGen = api;
})(typeof self !== 'undefined' ? self : this);
