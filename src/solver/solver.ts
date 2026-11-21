import { tr } from '../i18n'
import { deciToKm, usesRoadMatrix } from './distance'
import { solveHeuristic } from './heuristic'
import { buildTruckPlan, explainUnassigned, popcount, prepare, routeDeci, routeSec, timeOf, type Prepared } from './prepare'
import { withinLimit } from './time'
import type { Plan, ProblemInput, Truck, UnassignedOrder } from './types'
import { InputError, MAX_EXACT_ORDERS, checkInput } from './validateInput'

/**
 * Exact solver for the pickup-and-delivery problem with a small number of orders.
 *
 * 1. Per truck, a dynamic program over states (current location, status of every order)
 *    where each order is 0 = waiting, 1 = on the truck, 2 = delivered / not in this route.
 *    It gives the shortest route for EVERY subset of orders that the truck could serve,
 *    respecting capacity (kg), max machines on board and pickup-before-delivery.
 * 2. Subsets that break the daily time limit are discarded. Loading/unloading time of a
 *    subset is the sum of its orders' minutes (a constant for the subset), and the break is
 *    a constant too, so with an average speed the shortest route is also the fastest one
 *    and the DP stays exact.
 *    With per-relation travel times (real map, road times) that no longer holds: if the
 *    shortest route of a subset breaks the limit, a second DP finds the fastest route; if
 *    that one fits, it is used and counted in Plan.timeFallbacks (optimum not proven).
 * 3. A subset-convolution DP over N trucks picks disjoint subsets that serve the most
 *    orders, and among those the smallest total distance. O(N * 3^n).
 *
 * All distances are integer deci-km (tenths of a km), so totals are exact sums of rounded legs.
 */

interface TruckDp {
  /** Time-feasible cost (deci-km) for each subset (Infinity if impossible or over the daily limit). */
  feasibleCostBySubset: Float64Array
  /** Sequence of actions for a subset. */
  actions: (mask: number) => number[]
  /** Subsets for which the fastest instead of the shortest route was used. */
  fallbacks: number
}

interface RouteDp {
  cost: Float64Array
  actions: (mask: number) => number[]
}

/**
 * Cheapest route for every subset of orders under the given leg weights (deci-km or seconds),
 * respecting capacity, max machines and pickup-before-delivery.
 */
function routeDp(p: Prepared, truck: Truck, weight: number[][]): RouteDp {
  const { orders, base } = p
  const n = orders.length
  const pow3: number[] = [1]
  for (let i = 1; i <= n; i++) pow3.push(pow3[i - 1] * 3)
  const numStates = pow3[n]
  const numLocs = weight.length

  // Float32 is exact for integers below 2^24 (1.6 million km in deci-km, 194 days in seconds);
  // -1 = not computed. The memo is released after the subset costs are known.
  let memo: Float32Array | null = new Float32Array(numLocs * numStates).fill(-1)
  const choice = new Int8Array(numLocs * numStates).fill(-1)

  const f = (loc: number, state: number): number => {
    const key = loc * numStates + state
    const cached = memo![key]
    if (cached >= 0) return cached

    let loadKg = 0
    let loadCount = 0
    let pending = false
    for (let i = 0, st = state; i < n; i++, st = Math.floor(st / 3)) {
      const d = st % 3
      if (d === 1) {
        loadKg += orders[i].weightKg
        loadCount++
      }
      if (d !== 2) pending = true
    }

    let best = Infinity
    let bestChoice = -1
    if (!pending) {
      best = weight[loc][base]
    } else {
      for (let i = 0, st = state; i < n; i++, st = Math.floor(st / 3)) {
        const d = st % 3
        if (d === 0) {
          if (loadKg + orders[i].weightKg > truck.capacityKg) continue
          if (loadCount + 1 > truck.maxItems) continue
          const next = orders[i].pickup
          const c = weight[loc][next] + f(next, state + pow3[i])
          if (c < best) {
            best = c
            bestChoice = i * 2
          }
        } else if (d === 1) {
          const next = orders[i].delivery
          const c = weight[loc][next] + f(next, state + pow3[i])
          if (c < best) {
            best = c
            bestChoice = i * 2 + 1
          }
        }
      }
    }
    memo![key] = best
    choice[key] = bestChoice
    return best
  }

  const fullMask = (1 << n) - 1
  const startState = (mask: number): number => {
    let st = 0
    for (let i = 0; i < n; i++) if (!(mask & (1 << i))) st += 2 * pow3[i]
    return st
  }

  const cost = new Float64Array(fullMask + 1)
  for (let mask = 0; mask <= fullMask; mask++) cost[mask] = f(base, startState(mask))
  memo = null

  const actions = (mask: number): number[] => {
    const seq: number[] = []
    let loc = base
    let state = startState(mask)
    for (;;) {
      const c = choice[loc * numStates + state]
      if (c < 0) break
      seq.push(c)
      const i = c >> 1
      state += pow3[i]
      loc = c & 1 ? orders[i].delivery : orders[i].pickup
    }
    return seq
  }
  return { cost, actions }
}

function buildTruckDp(p: Prepared, truck: Truck, handlingBySubset: Float64Array): TruckDp {
  const { settings } = p
  const fullMask = (1 << p.orders.length) - 1
  const byKm = routeDp(p, truck, p.dist)
  let byTime: RouteDp | null = null
  const useTime = new Uint8Array(fullMask + 1)
  let fallbacks = 0

  const fits = (deci: number, sec: number, mask: number) =>
    withinLimit(timeOf(p, deci, sec, handlingBySubset[mask], mask !== 0), settings)

  const feasibleCostBySubset = new Float64Array(fullMask + 1)
  for (let mask = 0; mask <= fullMask; mask++) {
    const deci = byKm.cost[mask]
    if (!Number.isFinite(deci)) {
      feasibleCostBySubset[mask] = Infinity
      continue
    }
    // Average speed: time is proportional to km, so the km-route's time decides exactly.
    const sec = p.legTimes ? routeSec(p, byKm.actions(mask)) : 0
    if (fits(deci, sec, mask)) {
      feasibleCostBySubset[mask] = deci
      continue
    }
    feasibleCostBySubset[mask] = Infinity
    if (!p.legTimes || settings.timeLimitMode === 'none') continue
    // Per-relation times: the fastest route may fit where the shortest does not.
    byTime ??= routeDp(p, truck, p.sec)
    const fastest = byTime.actions(mask)
    const fastDeci = routeDeci(p, fastest)
    if (fits(fastDeci, byTime.cost[mask], mask)) {
      feasibleCostBySubset[mask] = fastDeci
      useTime[mask] = 1
      fallbacks++
    }
  }

  const actions = (mask: number): number[] => (useTime[mask] ? byTime!.actions(mask) : byKm.actions(mask))
  return { feasibleCostBySubset, actions, fallbacks }
}

interface Convolution {
  /** cheapest total cost (deci-km) for exactly this set of served orders */
  best: Float64Array
  picks: Int32Array[]
  /** most orders served, then fewest km */
  bestMask: number
}

/** Subset convolution over trucks: disjoint subsets, most orders served, then fewest km. O(N * 3^n). */
function convolve(costs: Float64Array[], fullMask: number): Convolution {
  // best[mask] = cheapest way to serve exactly `mask` with the trucks processed so far;
  // picks[t][mask] = subset given to truck t.
  let best = Float64Array.from(costs[0])
  const picks: Int32Array[] = [Int32Array.from({ length: fullMask + 1 }, (_, m) => m)]
  for (let t = 1; t < costs.length; t++) {
    const cost = costs[t]
    const next = new Float64Array(fullMask + 1).fill(Infinity)
    const pick = new Int32Array(fullMask + 1)
    for (let mask = 0; mask <= fullMask; mask++) {
      // iterate all submasks of mask, including 0
      for (let sub = mask; ; sub = (sub - 1) & mask) {
        const c = cost[sub] + best[mask ^ sub]
        if (c < next[mask]) {
          next[mask] = c
          pick[mask] = sub
        }
        if (sub === 0) break
      }
    }
    best = next
    picks.push(pick)
  }
  let bestMask = 0
  for (let mask = 1; mask <= fullMask; mask++) {
    if (!Number.isFinite(best[mask])) continue
    const pc = popcount(mask)
    const bestPc = popcount(bestMask)
    if (pc > bestPc || (pc === bestPc && best[mask] < best[bestMask])) bestMask = mask
  }
  return { best, picks, bestMask }
}

/** Optimal assignment and routes: list of action sequences per truck. */
function solveExact(p: Prepared): { routes: number[][]; fallbacks: number } {
  const n = p.orders.length
  const fullMask = (1 << n) - 1

  const handlingBySubset = new Float64Array(fullMask + 1)
  for (let mask = 1; mask <= fullMask; mask++) {
    const low = 31 - Math.clz32(mask & -mask)
    handlingBySubset[mask] = handlingBySubset[mask & (mask - 1)] + p.orders[low].handlingMinutes
  }

  const dps = p.input.trucks.map((t) => buildTruckDp(p, t, handlingBySubset))
  const costs = dps.map((d) => d.feasibleCostBySubset)
  let conv = convolve(costs, fullMask)

  // 'balanced': the shortest possible longest working day among plans that serve the same
  // number of orders and are at most `balanceMaxExtraPct` % longer than the minimum km;
  // then fewest km at that day length. Exact: binary search over the distinct day lengths
  // of all (truck, subset) routes, each step one km convolution limited to that length.
  if (p.settings.objective === 'balanced') {
    const served = popcount(conv.bestMask)
    const bound = conv.best[conv.bestMask] * (1 + (p.settings.balanceMaxExtraPct ?? 10) / 100) + 1e-6
    const hours = dps.map((d, t) => {
      const h = new Float64Array(fullMask + 1).fill(Infinity)
      for (let mask = 0; mask <= fullMask; mask++) {
        if (!Number.isFinite(costs[t][mask])) continue
        const acts = d.actions(mask)
        h[mask] =
          mask === 0 ? 0 : timeOf(p, routeDeci(p, acts), routeSec(p, acts), handlingBySubset[mask], true).totalHours
      }
      return h
    })
    const levels = [...new Set(hours.flatMap((h) => [...h].filter(Number.isFinite)))].sort((x, y) => x - y)
    const limited = (T: number) => convolve(costs.map((c, t) => c.map((v, m) => (hours[t][m] <= T + 1e-9 ? v : Infinity))), fullMask)
    const ok = (c: Convolution) => popcount(c.bestMask) === served && c.best[c.bestMask] <= bound
    let lo = 0
    let hi = levels.length - 1 // the largest level is the unrestricted plan, which is ok
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ok(limited(levels[mid]))) hi = mid
      else lo = mid + 1
    }
    if (levels.length) conv = limited(levels[lo])
  }

  // Walk the picks backwards to get each truck's subset.
  const routes: number[][] = new Array(dps.length)
  let remaining = conv.bestMask
  for (let t = dps.length - 1; t >= 0; t--) {
    const sub = conv.picks[t][remaining]
    routes[t] = dps[t].actions(sub)
    remaining ^= sub
  }
  return { routes, fallbacks: dps.reduce((sum, d) => sum + d.fallbacks, 0) }
}

export function solve(input: ProblemInput): Plan {
  const problems = checkInput(input)
  const n = input.orders.length
  const mode = input.settings.solverMode
  if (mode === 'exact' && n > MAX_EXACT_ORDERS)
    problems.push(tr('in.exactTooMany', { max: MAX_EXACT_ORDERS, n }))
  if (problems.length) throw new InputError(problems)

  const t0 = performance.now()
  const p = prepare(input)
  const solverUsed = mode === 'heuristic' || (mode === 'auto' && n > MAX_EXACT_ORDERS) ? 'heuristic' : 'exact'
  const exact = solverUsed === 'exact' ? solveExact(p) : null
  const routes = exact ? exact.routes : solveHeuristic(p)

  const trucks = input.trucks.map((truck, t) => buildTruckPlan(p, truck, routes[t]))
  const servedSet = new Set(trucks.flatMap((tp) => tp.orderIds))
  const served = servedSet.size
  const unassigned: UnassignedOrder[] = p.orders
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => !servedSet.has(o.id))
    .map(({ o, i }) => ({ orderId: o.id, reason: explainUnassigned(p, i, served, solverUsed) }))

  const totalDeci = trucks.reduce((sum, tp) => sum + Math.round(tp.totalKm * 10), 0)
  return {
    trucks,
    unassigned,
    totalKm: deciToKm(totalDeci),
    ordersCompleted: served,
    solveMs: performance.now() - t0,
    solverUsed,
    distanceUsed: input.coordinateMode === 'xy' ? 'xy' : usesRoadMatrix(input) ? 'road' : 'air',
    timeUsed: p.legTimes ? 'road' : 'speed',
    timeFallbacks: exact?.fallbacks ?? 0,
  }
}
