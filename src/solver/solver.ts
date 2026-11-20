import { deciToKm, usesRoadMatrix } from './distance'
import { solveHeuristic } from './heuristic'
import { buildTruckPlan, explainUnassigned, popcount, prepare, type Prepared } from './prepare'
import { routeTime, withinLimit } from './time'
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
 *    a constant too, so the shortest route is also the fastest one and the DP stays exact.
 * 3. A subset-convolution DP over N trucks picks disjoint subsets that serve the most
 *    orders, and among those the smallest total distance. O(N * 3^n).
 *
 * All distances are integer deci-km (tenths of a km), so totals are exact sums of rounded legs.
 */

interface TruckDp {
  /** Shortest route in deci-km for each subset mask (Infinity = impossible). */
  costBySubset: Float64Array
  /** Time-feasible cost for each subset (Infinity if it breaks the daily limit). */
  feasibleCostBySubset: Float64Array
  /** Sequence of actions for a subset. */
  actions: (mask: number) => number[]
}

function buildTruckDp(p: Prepared, truck: Truck, handlingBySubset: Float64Array): TruckDp {
  const { orders, dist, base, settings } = p
  const n = orders.length
  const pow3: number[] = [1]
  for (let i = 1; i <= n; i++) pow3.push(pow3[i - 1] * 3)
  const numStates = pow3[n]
  const numLocs = dist.length

  // Float32 is exact for integer deci-km below 2^24 (1.6 million km); -1 = not computed.
  // The memo is released after the subset costs are known; only the choices are kept.
  let memo: Float32Array | null = new Float32Array(numLocs * numStates).fill(-1)
  const choice = new Int8Array(numLocs * numStates).fill(-1)

  const f = (loc: number, state: number): number => {
    const key = loc * numStates + state
    const cached = memo![key]
    if (cached >= 0) return cached

    let loadKg = 0
    let loadCount = 0
    let pending = false
    for (let i = 0, s = state; i < n; i++, s = Math.floor(s / 3)) {
      const d = s % 3
      if (d === 1) {
        loadKg += orders[i].weightKg
        loadCount++
      }
      if (d !== 2) pending = true
    }

    let best = Infinity
    let bestChoice = -1
    if (!pending) {
      best = dist[loc][base]
    } else {
      for (let i = 0, s = state; i < n; i++, s = Math.floor(s / 3)) {
        const d = s % 3
        if (d === 0) {
          if (loadKg + orders[i].weightKg > truck.capacityKg) continue
          if (loadCount + 1 > truck.maxItems) continue
          const next = orders[i].pickup
          const c = dist[loc][next] + f(next, state + pow3[i])
          if (c < best) {
            best = c
            bestChoice = i * 2
          }
        } else if (d === 1) {
          const next = orders[i].delivery
          const c = dist[loc][next] + f(next, state + pow3[i])
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
    let s = 0
    for (let i = 0; i < n; i++) if (!(mask & (1 << i))) s += 2 * pow3[i]
    return s
  }

  const costBySubset = new Float64Array(fullMask + 1)
  const feasibleCostBySubset = new Float64Array(fullMask + 1)
  for (let mask = 0; mask <= fullMask; mask++) {
    const cost = f(base, startState(mask))
    costBySubset[mask] = cost
    const ok =
      Number.isFinite(cost) && withinLimit(routeTime(deciToKm(cost), handlingBySubset[mask], mask !== 0, settings), settings)
    feasibleCostBySubset[mask] = ok ? cost : Infinity
  }
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

  return { costBySubset, feasibleCostBySubset, actions }
}

/** Optimal assignment and routes: list of action sequences per truck. */
function solveExact(p: Prepared): number[][] {
  const n = p.orders.length
  const fullMask = (1 << n) - 1

  const handlingBySubset = new Float64Array(fullMask + 1)
  for (let mask = 1; mask <= fullMask; mask++) {
    const low = 31 - Math.clz32(mask & -mask)
    handlingBySubset[mask] = handlingBySubset[mask & (mask - 1)] + p.orders[low].handlingMinutes
  }

  const dps = p.input.trucks.map((t) => buildTruckDp(p, t, handlingBySubset))

  // Subset convolution over trucks: best[mask] = cheapest way to serve exactly `mask`
  // with the trucks processed so far; picks[t][mask] = subset given to truck t.
  let best = Float64Array.from(dps[0].feasibleCostBySubset)
  const picks: Int32Array[] = [Int32Array.from({ length: fullMask + 1 }, (_, m) => m)]
  for (let t = 1; t < dps.length; t++) {
    const cost = dps[t].feasibleCostBySubset
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

  // Most orders served first, then fewest km.
  let bestMask = 0
  for (let mask = 1; mask <= fullMask; mask++) {
    if (!Number.isFinite(best[mask])) continue
    const pc = popcount(mask)
    const bestPc = popcount(bestMask)
    if (pc > bestPc || (pc === bestPc && best[mask] < best[bestMask])) bestMask = mask
  }

  // Walk the picks backwards to get each truck's subset.
  const routes: number[][] = new Array(dps.length)
  let remaining = bestMask
  for (let t = dps.length - 1; t >= 0; t--) {
    const sub = picks[t][remaining]
    routes[t] = dps[t].actions(sub)
    remaining ^= sub
  }
  return routes
}

export function solve(input: ProblemInput): Plan {
  const problems = checkInput(input)
  const n = input.orders.length
  const mode = input.settings.solverMode
  if (mode === 'exact' && n > MAX_EXACT_ORDERS)
    problems.push(
      `Egzaktni solver podržava najviše ${MAX_EXACT_ORDERS} naloga (zadano: ${n}). Odaberi "Automatski" ili "Heuristika".`,
    )
  if (problems.length) throw new InputError(problems)

  const t0 = performance.now()
  const p = prepare(input)
  const solverUsed = mode === 'heuristic' || (mode === 'auto' && n > MAX_EXACT_ORDERS) ? 'heuristic' : 'exact'
  const routes = solverUsed === 'exact' ? solveExact(p) : solveHeuristic(p)

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
  }
}
