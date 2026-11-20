import { deciToKm } from './distance'
import type { Prepared } from './prepare'
import { routeTime, withinLimit } from './time'
import type { Truck } from './types'

/**
 * Heuristic solver for larger instances (more than 12 orders), decision D3.
 *
 * 1. Construction by insertion: each pickup/delivery pair is inserted where it adds the
 *    fewest km. Several starts are run (regret-2, cheapest-first and seeded shuffles).
 * 2. Local search until no move improves:
 *    - insert still unassigned orders wherever they fit
 *    - relocate: take one order out and re-insert it at its best place (same or another truck),
 *      which also re-orders stops within a route
 *    - swap: exchange two orders between two trucks
 * Every insertion respects capacity, max machines, pickup-before-delivery on the same truck
 * and the daily time limit (including per-order handling minutes and the break).
 *
 * Objective, as in the exact solver: most orders served, then fewest km.
 * There is no optimality guarantee; tests compare it with the exact solver on small instances.
 */

interface RouteState {
  truck: Truck
  /** actions: orderIndex * 2 + (0 pickup / 1 delivery) */
  actions: number[]
  /** node locations: [base, ...action locations, base] */
  nodes: number[]
  /** load after node k (kg / count); node 0 = base */
  loadKg: number[]
  loadCount: number[]
  deci: number
  handlingMinutes: number
}

interface Insertion {
  delta: number
  /** pickup goes after node k, delivery after node m (m >= k, in original node numbering) */
  k: number
  m: number
}

function makeState(p: Prepared, truck: Truck, actions: number[]): RouteState {
  const nodes = [p.base]
  const loadKg = [0]
  const loadCount = [0]
  let kg = 0
  let cnt = 0
  let deci = 0
  let handling = 0
  for (const a of actions) {
    const o = p.orders[a >> 1]
    const loc = a & 1 ? o.delivery : o.pickup
    deci += p.dist[nodes[nodes.length - 1]][loc]
    nodes.push(loc)
    if (a & 1) {
      kg -= o.weightKg
      cnt--
    } else {
      kg += o.weightKg
      cnt++
      handling += o.handlingMinutes
    }
    loadKg.push(kg)
    loadCount.push(cnt)
  }
  deci += p.dist[nodes[nodes.length - 1]][p.base]
  nodes.push(p.base)
  loadKg.push(0)
  loadCount.push(0)
  return { truck, actions, nodes, loadKg, loadCount, deci, handlingMinutes: handling }
}

function fitsTime(p: Prepared, deci: number, handlingMinutes: number): boolean {
  return withinLimit(routeTime(deciToKm(deci), handlingMinutes, true, p.settings), p.settings)
}

/** Cheapest feasible insertion of order i into route r, or null. */
function bestInsertion(p: Prepared, r: RouteState, i: number): Insertion | null {
  const o = p.orders[i]
  const { truck, nodes, loadKg, loadCount } = r
  if (o.weightKg > truck.capacityKg || truck.maxItems < 1) return null
  const d = p.dist
  const P = o.pickup
  const D = o.delivery
  const handling = r.handlingMinutes + o.handlingMinutes
  const last = nodes.length - 2 // last node after which something can be inserted
  let best: Insertion | null = null

  for (let k = 0; k <= last; k++) {
    if (loadKg[k] + o.weightKg > truck.capacityKg || loadCount[k] + 1 > truck.maxItems) continue
    const a = nodes[k]
    const b = nodes[k + 1]
    const pickupDelta = d[a][P] + d[P][b] - d[a][b]
    for (let m = k; m <= last; m++) {
      // the machine is on board after nodes k..m
      if (m > k && (loadKg[m] + o.weightKg > truck.capacityKg || loadCount[m] + 1 > truck.maxItems)) break
      let delta: number
      if (m === k) delta = d[a][P] + d[P][D] + d[D][b] - d[a][b]
      else {
        const c = nodes[m]
        const e = nodes[m + 1]
        delta = pickupDelta + d[c][D] + d[D][e] - d[c][e]
      }
      if (best && delta >= best.delta) continue
      if (!fitsTime(p, r.deci + delta, handling)) continue
      best = { delta, k, m }
    }
  }
  return best
}

function applyInsertion(p: Prepared, r: RouteState, i: number, ins: Insertion): RouteState {
  const acts = r.actions.slice()
  // node k corresponds to action index k-1, so "after node k" = position k in actions
  acts.splice(ins.m, 0, i * 2 + 1)
  acts.splice(ins.k, 0, i * 2)
  return makeState(p, r.truck, acts)
}

function removeOrder(p: Prepared, r: RouteState, i: number): RouteState {
  return makeState(
    p,
    r.truck,
    r.actions.filter((a) => a >> 1 !== i),
  )
}

interface Solution {
  routes: RouteState[]
  served: number
  deci: number
}

function evaluate(routes: RouteState[]): Solution {
  let served = 0
  let deci = 0
  for (const r of routes) {
    served += r.actions.length / 2
    if (r.actions.length) deci += r.deci
  }
  return { routes, served, deci }
}

function better(a: Solution, b: Solution): boolean {
  return a.served > b.served || (a.served === b.served && a.deci < b.deci)
}

/** Seeded PRNG (mulberry32) so results are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Strategy = { kind: 'regret' } | { kind: 'order'; order: number[] }

function construct(p: Prepared, strategy: Strategy): RouteState[] {
  let routes = p.input.trucks.map((t) => makeState(p, t, []))
  const pending = new Set(p.orders.map((_, i) => i))

  if (strategy.kind === 'order') {
    for (const i of strategy.order) {
      let bestT = -1
      let bestIns: Insertion | null = null
      routes.forEach((r, t) => {
        const ins = bestInsertion(p, r, i)
        if (ins && (!bestIns || ins.delta < bestIns.delta)) {
          bestIns = ins
          bestT = t
        }
      })
      if (bestIns) {
        routes = routes.map((r, t) => (t === bestT ? applyInsertion(p, r, i, bestIns!) : r))
        pending.delete(i)
      }
    }
    return routes
  }

  return regretInsert(p, routes, pending)
}

/** regret-2: repeatedly insert the order that would lose the most if it missed its best truck. */
function regretInsert(p: Prepared, start: RouteState[], pending: Set<number>): RouteState[] {
  let routes = start
  for (;;) {
    let pick = -1
    let pickT = -1
    let pickIns: Insertion | null = null
    let pickRegret = -Infinity
    for (const i of pending) {
      let best: Insertion | null = null
      let bestT = -1
      let second = Infinity
      routes.forEach((r, t) => {
        const ins = bestInsertion(p, r, i)
        if (!ins) return
        if (!best || ins.delta < best.delta) {
          if (best) second = best.delta
          best = ins
          bestT = t
        } else if (ins.delta < second) second = ins.delta
      })
      if (!best) continue
      const b = best as Insertion
      const regret = second === Infinity ? 1e12 : second - b.delta
      if (regret > pickRegret || (regret === pickRegret && pickIns && b.delta < pickIns.delta)) {
        pick = i
        pickT = bestT
        pickIns = b
        pickRegret = regret
      }
    }
    if (pick < 0 || !pickIns) break
    const ins = pickIns
    routes = routes.map((r, t) => (t === pickT ? applyInsertion(p, r, pick, ins) : r))
    pending.delete(pick)
  }
  return routes
}

/** Best place for order i over all routes. */
function bestOverRoutes(p: Prepared, routes: RouteState[], i: number): { t: number; ins: Insertion } | null {
  let res: { t: number; ins: Insertion } | null = null
  routes.forEach((r, t) => {
    const ins = bestInsertion(p, r, i)
    if (ins && (!res || ins.delta < res.ins.delta)) res = { t, ins }
  })
  return res
}

function localSearch(p: Prepared, start: RouteState[]): RouteState[] {
  let routes = start
  const n = p.orders.length
  const truckOf = (rs: RouteState[]) => {
    const owner = new Array<number>(n).fill(-1)
    rs.forEach((r, t) => r.actions.forEach((a) => (owner[a >> 1] = t)))
    return owner
  }

  for (let guard = 0; guard < 500; guard++) {
    let improved = false
    let owner = truckOf(routes)

    // 1. insert unassigned orders
    for (let i = 0; i < n; i++) {
      if (owner[i] >= 0) continue
      const b = bestOverRoutes(p, routes, i)
      if (b) {
        routes = routes.map((r, t) => (t === b.t ? applyInsertion(p, r, i, b.ins) : r))
        owner = truckOf(routes)
        improved = true
      }
    }

    // 1b. ejection: make room for an unassigned order u by moving one order j elsewhere
    for (let u = 0; u < n; u++) {
      if (owner[u] >= 0) continue
      let done = false
      for (let j = 0; j < n && !done; j++) {
        const tj = owner[j]
        if (tj < 0) continue
        const without = routes.map((r, t) => (t === tj ? removeOrder(p, r, j) : r))
        const insU = bestInsertion(p, without[tj], u)
        if (!insU) continue
        const withU = without.map((r, t) => (t === tj ? applyInsertion(p, r, u, insU) : r))
        const b = bestOverRoutes(p, withU, j)
        if (!b) continue
        routes = withU.map((r, t) => (t === b.t ? applyInsertion(p, r, j, b.ins) : r))
        owner = truckOf(routes)
        improved = true
        done = true
      }
    }

    // 2. relocate one order (also re-orders within the same route)
    for (let i = 0; i < n; i++) {
      const t0 = owner[i]
      if (t0 < 0) continue
      const removed = removeOrder(p, routes[t0], i)
      const gain = routes[t0].deci - removed.deci
      const trial = routes.map((r, t) => (t === t0 ? removed : r))
      const b = bestOverRoutes(p, trial, i)
      if (b && b.ins.delta < gain) {
        routes = trial.map((r, t) => (t === b.t ? applyInsertion(p, r, i, b.ins) : r))
        owner = truckOf(routes)
        improved = true
      }
    }

    // 3. swap two orders between two trucks
    for (let i = 0; i < n && routes.length > 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const ti = owner[i]
        const tj = owner[j]
        if (ti < 0 || tj < 0 || ti === tj) continue
        const ri = removeOrder(p, routes[ti], i)
        const rj = removeOrder(p, routes[tj], j)
        const insJ = bestInsertion(p, ri, j)
        if (!insJ) continue
        const insI = bestInsertion(p, rj, i)
        if (!insI) continue
        const before = routes[ti].deci + routes[tj].deci
        const after = ri.deci + insJ.delta + rj.deci + insI.delta
        if (after < before) {
          routes = routes.map((r, t) =>
            t === ti ? applyInsertion(p, ri, j, insJ) : t === tj ? applyInsertion(p, rj, i, insI) : r,
          )
          owner = truckOf(routes)
          improved = true
        }
      }
    }

    if (!improved) break
  }
  return routes
}

/** Returns the action sequence for every truck (same shape as the exact solver). */
export function solveHeuristic(p: Prepared, starts = 6, iterations = 1500, timeBudgetMs = 1500): number[][] {
  const n = p.orders.length
  const ids = Array.from({ length: n }, (_, i) => i)
  // cheapest-first by the distance of the order itself (long trips first)
  const byLength = ids
    .slice()
    .sort(
      (a, b) =>
        p.dist[p.orders[b].pickup][p.orders[b].delivery] - p.dist[p.orders[a].pickup][p.orders[a].delivery] || a - b,
    )
  const strategies: Strategy[] = [{ kind: 'regret' }, { kind: 'order', order: byLength }]
  const rand = rng(12345)
  while (strategies.length < starts) {
    const order = ids.slice()
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1))
      ;[order[k], order[j]] = [order[j], order[k]]
    }
    strategies.push({ kind: 'order', order })
  }

  let best: Solution | null = null
  for (const s of strategies) {
    const sol = evaluate(localSearch(p, construct(p, s)))
    if (!best || better(sol, best)) best = sol
  }

  // Ruin & recreate: remove a few related orders (near a random seed order) or random ones,
  // re-insert with regret-2, polish with local search; accept by simulated annealing, keep the best.
  let current = best!
  const deadline = performance.now() + timeBudgetMs
  for (let it = 0; it < iterations && n > 1 && performance.now() < deadline; it++) {
    const size = Math.max(2, Math.min(n, Math.round(n * (0.15 + 0.25 * rand()))))
    const removed = new Set<number>()
    if (rand() < 0.5) {
      const seed = Math.floor(rand() * n)
      const o = p.orders[seed]
      const near = ids
        .slice()
        .sort(
          (a, b) =>
            p.dist[o.pickup][p.orders[a].pickup] + p.dist[o.delivery][p.orders[a].delivery] -
            (p.dist[o.pickup][p.orders[b].pickup] + p.dist[o.delivery][p.orders[b].delivery]),
        )
      for (const i of near.slice(0, size)) removed.add(i)
    } else {
      while (removed.size < size) removed.add(Math.floor(rand() * n))
    }
    const ruined = current.routes.map((r) =>
      r.actions.some((a) => removed.has(a >> 1)) ? makeState(p, r.truck, r.actions.filter((a) => !removed.has(a >> 1))) : r,
    )
    const served = new Set(ruined.flatMap((r) => r.actions.map((a) => a >> 1)))
    const pending = new Set(ids.filter((i) => !served.has(i)))
    const candidate = evaluate(localSearch(p, regretInsert(p, ruined, pending)))
    // Simulated-annealing acceptance: never fewer orders; a slightly longer plan is accepted
    // with a probability that shrinks as the search goes on (start: ~1 % of the distance).
    const temp = (0.01 * best!.deci + 1) * (1 - it / iterations)
    const worseBy = candidate.deci - current.deci
    if (
      !better(current, candidate) ||
      (candidate.served === current.served && worseBy > 0 && rand() < Math.exp(-worseBy / temp))
    )
      current = candidate
    if (better(current, best!)) best = current
  }
  return best!.routes.map((r) => r.actions)
}
