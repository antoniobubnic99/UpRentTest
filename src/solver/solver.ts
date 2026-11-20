import { deciToKm, legDeciKm } from './distance'
import type {
  Location,
  Plan,
  ProblemInput,
  RouteStep,
  Settings,
  Truck,
  TruckPlan,
  UnassignedOrder,
} from './types'
import { InputError, checkInput } from './validateInput'

/**
 * Exact solver for the pickup-and-delivery problem with a small number of orders.
 *
 * 1. Per truck, a dynamic program over states (current location, status of every order)
 *    where each order is 0 = waiting, 1 = on the truck, 2 = delivered / not in this route.
 *    It gives the shortest route for EVERY subset of orders that the truck could serve,
 *    respecting capacity (kg), max machines on board and pickup-before-delivery.
 * 2. Subsets that break the daily time limit are discarded.
 * 3. A subset-convolution DP over trucks picks disjoint subsets that serve the most orders,
 *    and among those the smallest total distance.
 *
 * All distances are integer deci-km (tenths of a km), so totals are exact sums of rounded legs.
 */

interface PreparedOrder {
  id: string
  machineId: string
  weightKg: number
  pickup: number
  delivery: number
}

interface TruckDp {
  /** Shortest route in deci-km for each subset mask (Infinity = impossible). */
  costBySubset: Float64Array
  /** Time-feasible cost for each subset (Infinity if it breaks the daily limit). */
  feasibleCostBySubset: Float64Array
  /** Sequence of actions (orderIndex * 2 + 0 pickup / 1 delivery) for a subset. */
  actions: (mask: number) => number[]
}

function popcount(x: number): number {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

/** Hours counted against the daily limit for a route. */
export function limitedHours(km: number, actions: number, settings: Settings): number {
  const drive = km / settings.speedKmh
  const handling = (actions * settings.handlingMinutes) / 60
  switch (settings.timeLimitMode) {
    case 'drive+handling':
      return drive + handling
    case 'drive':
      return drive
    case 'none':
      return 0
  }
}

function withinLimit(km: number, actions: number, settings: Settings): boolean {
  if (settings.timeLimitMode === 'none') return true
  return limitedHours(km, actions, settings) <= settings.maxHoursPerDay + 1e-9
}

function buildTruckDp(
  truck: Truck,
  orders: PreparedOrder[],
  dist: number[][],
  base: number,
  settings: Settings,
): TruckDp {
  const n = orders.length
  const pow3: number[] = [1]
  for (let i = 1; i <= n; i++) pow3.push(pow3[i - 1] * 3)
  const numStates = pow3[n]
  const numLocs = dist.length

  const memo = new Float64Array(numLocs * numStates).fill(-1)
  const choice = new Int16Array(numLocs * numStates).fill(-1)

  const f = (loc: number, state: number): number => {
    const key = loc * numStates + state
    const cached = memo[key]
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
    memo[key] = best
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
    const ok = Number.isFinite(cost) && withinLimit(deciToKm(cost), 2 * popcount(mask), settings)
    feasibleCostBySubset[mask] = ok ? cost : Infinity
  }

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

function buildTruckPlan(
  truck: Truck,
  mask: number,
  dp: TruckDp,
  orders: PreparedOrder[],
  locations: Location[],
  dist: number[][],
  base: number,
  settings: Settings,
): TruckPlan {
  const steps: RouteStep[] = []
  let loc = base
  let cumDeci = 0
  let loadKg = 0
  let loadCount = 0
  let actionCount = 0
  const hoursNow = () => deciToKm(cumDeci) / settings.speedKmh + (actionCount * settings.handlingMinutes) / 60

  steps.push({
    seq: 0,
    locationId: locations[base].id,
    action: 'start',
    legKm: 0,
    cumulativeKm: 0,
    loadKg: 0,
    loadCount: 0,
    cumulativeHours: 0,
  })

  for (const a of dp.actions(mask)) {
    const order = orders[a >> 1]
    const isDelivery = (a & 1) === 1
    const next = isDelivery ? order.delivery : order.pickup
    const leg = dist[loc][next]
    cumDeci += leg
    actionCount++
    if (isDelivery) {
      loadKg -= order.weightKg
      loadCount--
    } else {
      loadKg += order.weightKg
      loadCount++
    }
    steps.push({
      seq: steps.length,
      locationId: locations[next].id,
      action: isDelivery ? 'delivery' : 'pickup',
      orderId: order.id,
      machineId: order.machineId,
      legKm: deciToKm(leg),
      cumulativeKm: deciToKm(cumDeci),
      loadKg,
      loadCount,
      cumulativeHours: hoursNow(),
    })
    loc = next
  }

  const back = dist[loc][base]
  cumDeci += back
  steps.push({
    seq: steps.length,
    locationId: locations[base].id,
    action: 'return',
    legKm: deciToKm(back),
    cumulativeKm: deciToKm(cumDeci),
    loadKg,
    loadCount,
    cumulativeHours: hoursNow(),
  })

  const orderIds = orders.filter((_, i) => mask & (1 << i)).map((o) => o.id)
  const totalKm = deciToKm(cumDeci)
  const driveHours = totalKm / settings.speedKmh
  const handlingHours = (actionCount * settings.handlingMinutes) / 60
  return {
    truck,
    orderIds,
    steps,
    totalKm,
    driveHours,
    handlingHours,
    totalHours: driveHours + handlingHours,
    limitedHours: limitedHours(totalKm, actionCount, settings),
    ordersCompleted: orderIds.length,
  }
}

function formatKg(kg: number): string {
  return `${kg.toLocaleString('hr-HR')} kg`
}

function explainUnassigned(
  orderIndex: number,
  input: ProblemInput,
  orders: PreparedOrder[],
  dps: TruckDp[],
  served: number,
): string {
  const order = orders[orderIndex]
  const maxCapacity = Math.max(...input.trucks.map((t) => t.capacityKg))
  if (order.weightKg > maxCapacity) {
    return `Stroj ${order.machineId} (${formatKg(order.weightKg)}) teži je od nosivosti svih kamiona (najveća ${formatKg(maxCapacity)}).`
  }
  const single = 1 << orderIndex
  const aloneFeasible = dps.some((dp) => Number.isFinite(dp.feasibleCostBySubset[single]))
  if (!aloneFeasible) {
    const s = input.settings
    const shortest = Math.min(
      ...dps.map((dp) =>
        Number.isFinite(dp.costBySubset[single])
          ? limitedHours(deciToKm(dp.costBySubset[single]), 2, s)
          : Infinity,
      ),
    )
    return `Nalog ne stane u radni dan ni kad ga kamion vozi sam (najmanje ${shortest.toFixed(2)} h, limit ${s.maxHoursPerDay} h).`
  }
  return `Zbog dnevnog limita od ${input.settings.maxHoursPerDay} h kamioni mogu izvršiti najviše ${served} od ${orders.length} naloga; ovaj nalog je izostavljen jer optimalni raspored s najmanje km ne uključuje njega.`
}

export function solve(input: ProblemInput): Plan {
  const problems = checkInput(input)
  if (problems.length) throw new InputError(problems)

  const t0 = performance.now()
  const { settings } = input
  const locIndex = new Map(input.locations.map((l, i) => [l.id, i]))
  const machineWeight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const base = locIndex.get(input.baseId)!
  const dist = input.locations.map((a) => input.locations.map((b) => legDeciKm(a, b)))

  const orders: PreparedOrder[] = input.orders.map((o) => ({
    id: o.id,
    machineId: o.machineId,
    weightKg: machineWeight.get(o.machineId)!,
    pickup: locIndex.get(o.pickupId)!,
    delivery: locIndex.get(o.deliveryId)!,
  }))
  const n = orders.length
  const fullMask = (1 << n) - 1

  const dps = input.trucks.map((t) => buildTruckDp(t, orders, dist, base, settings))

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
  const truckMasks: number[] = new Array(dps.length).fill(0)
  let remaining = bestMask
  for (let t = dps.length - 1; t >= 0; t--) {
    const sub = picks[t][remaining]
    truckMasks[t] = sub
    remaining ^= sub
  }

  const trucks = input.trucks.map((truck, t) =>
    buildTruckPlan(truck, truckMasks[t], dps[t], orders, input.locations, dist, base, settings),
  )
  const served = popcount(bestMask)
  const unassigned: UnassignedOrder[] = orders
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => !(bestMask & (1 << i)))
    .map(({ o, i }) => ({ orderId: o.id, reason: explainUnassigned(i, input, orders, dps, served) }))

  const totalDeci = trucks.reduce((sum, tp) => sum + Math.round(tp.totalKm * 10), 0)
  return {
    trucks,
    unassigned,
    totalKm: deciToKm(totalDeci),
    ordersCompleted: served,
    solveMs: performance.now() - t0,
  }
}
