import { deciToKm, distanceOptions, legDeciKm } from './distance'
import { orderHandlingMinutes, routeTime, withinLimit } from './time'
import type { ProblemInput, RouteStep, Settings, Truck, TruckPlan } from './types'

/**
 * Shared, solver-independent preparation: index the data, build the distance matrix
 * (integer deci-km) over the locations that are actually used, and turn an action
 * sequence into a TruckPlan with times. Used by both the exact and the heuristic solver.
 *
 * An action is encoded as orderIndex * 2 + (0 = pickup, 1 = delivery).
 */

export interface PreparedOrder {
  id: string
  machineId: string
  weightKg: number
  /** compact location index */
  pickup: number
  delivery: number
  pickupMinutes: number
  deliveryMinutes: number
  /** pickupMinutes + deliveryMinutes */
  handlingMinutes: number
}

export interface Prepared {
  input: ProblemInput
  settings: Settings
  orders: PreparedOrder[]
  /** compact index -> location id; only the base and locations used by orders */
  locIds: string[]
  /** dist[a][b] in deci-km */
  dist: number[][]
  base: number
}

export function popcount(x: number): number {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

export function prepare(input: ProblemInput): Prepared {
  const { settings } = input
  const byId = new Map(input.locations.map((l) => [l.id, l]))
  const machineWeight = new Map(input.machines.map((m) => [m.id, m.weightKg]))

  const locIds: string[] = [input.baseId]
  const index = new Map<string, number>([[input.baseId, 0]])
  const idx = (id: string) => {
    if (!index.has(id)) {
      index.set(id, locIds.length)
      locIds.push(id)
    }
    return index.get(id)!
  }

  const orders: PreparedOrder[] = input.orders.map((o) => {
    const pickupMinutes = o.pickupMinutes ?? settings.handlingMinutes
    const deliveryMinutes = o.deliveryMinutes ?? settings.handlingMinutes
    return {
      id: o.id,
      machineId: o.machineId,
      weightKg: machineWeight.get(o.machineId)!,
      pickup: idx(o.pickupId),
      delivery: idx(o.deliveryId),
      pickupMinutes,
      deliveryMinutes,
      handlingMinutes: orderHandlingMinutes(o, settings),
    }
  })

  const opts = distanceOptions(input)
  const locs = locIds.map((id) => byId.get(id)!)
  const dist = locs.map((a) => locs.map((b) => legDeciKm(a, b, opts)))
  return { input, settings, orders, locIds, dist, base: 0 }
}

/** Distance (deci-km) of a route given as an action sequence, including leaving and returning to the base. */
export function routeDeci(p: Prepared, actions: number[]): number {
  let loc = p.base
  let total = 0
  for (const a of actions) {
    const o = p.orders[a >> 1]
    const next = a & 1 ? o.delivery : o.pickup
    total += p.dist[loc][next]
    loc = next
  }
  return total + p.dist[loc][p.base]
}

/**
 * Builds the step-by-step plan with loads and times. The break (if enabled) is placed
 * after the first pickup/delivery at which the elapsed working time reaches half of the
 * route's working time without the break; it does not change distances.
 */
export function buildTruckPlan(p: Prepared, truck: Truck, actions: number[]): TruckPlan {
  const { settings: s, orders, dist, locIds, base } = p
  const steps: RouteStep[] = []
  let loc = base
  let cumDeci = 0
  let loadKg = 0
  let loadCount = 0
  let clock = 0
  let handlingMin = 0

  steps.push({
    seq: 0,
    locationId: locIds[base],
    action: 'start',
    legKm: 0,
    cumulativeKm: 0,
    loadKg: 0,
    loadCount: 0,
    arrivalHours: 0,
    departureHours: 0,
    cumulativeHours: 0,
  })

  for (const a of actions) {
    const order = orders[a >> 1]
    const isDelivery = (a & 1) === 1
    const next = isDelivery ? order.delivery : order.pickup
    const leg = dist[loc][next]
    cumDeci += leg
    const arrival = clock + deciToKm(leg) / s.speedKmh
    const minutes = isDelivery ? order.deliveryMinutes : order.pickupMinutes
    handlingMin += minutes
    clock = arrival + minutes / 60
    if (isDelivery) {
      loadKg -= order.weightKg
      loadCount--
    } else {
      loadKg += order.weightKg
      loadCount++
    }
    steps.push({
      seq: steps.length,
      locationId: locIds[next],
      action: isDelivery ? 'delivery' : 'pickup',
      orderId: order.id,
      machineId: order.machineId,
      legKm: deciToKm(leg),
      cumulativeKm: deciToKm(cumDeci),
      loadKg,
      loadCount,
      arrivalHours: arrival,
      departureHours: clock,
      cumulativeHours: clock,
    })
    loc = next
  }

  const back = dist[loc][base]
  cumDeci += back
  const backArrival = clock + deciToKm(back) / s.speedKmh
  steps.push({
    seq: steps.length,
    locationId: locIds[base],
    action: 'return',
    legKm: deciToKm(back),
    cumulativeKm: deciToKm(cumDeci),
    loadKg,
    loadCount,
    arrivalHours: backArrival,
    departureHours: backArrival,
    cumulativeHours: backArrival,
  })

  const totalKm = deciToKm(cumDeci)
  const time = routeTime(totalKm, handlingMin, actions.length > 0, s)

  if (time.breakHours > 0) {
    const half = backArrival / 2
    let at = steps.findIndex((st) => (st.action === 'pickup' || st.action === 'delivery') && st.departureHours >= half - 1e-9)
    if (at < 0) at = steps.length - 2
    const prev = steps[at]
    steps.splice(at + 1, 0, {
      seq: 0,
      locationId: prev.locationId,
      action: 'break',
      legKm: 0,
      cumulativeKm: prev.cumulativeKm,
      loadKg: prev.loadKg,
      loadCount: prev.loadCount,
      arrivalHours: prev.departureHours,
      departureHours: prev.departureHours + time.breakHours,
      cumulativeHours: prev.departureHours + time.breakHours,
    })
    for (let i = at + 2; i < steps.length; i++) {
      steps[i].arrivalHours += time.breakHours
      steps[i].departureHours += time.breakHours
      steps[i].cumulativeHours += time.breakHours
    }
    steps.forEach((st, i) => (st.seq = i))
  }

  const orderIds = orders.filter((_, i) => actions.includes(i * 2)).map((o) => o.id)
  return {
    truck,
    orderIds,
    steps,
    totalKm,
    driveHours: time.driveHours,
    handlingHours: time.handlingHours,
    breakHours: time.breakHours,
    totalHours: time.totalHours,
    limitedHours: time.limitedHours,
    ordersCompleted: orderIds.length,
  }
}

function formatKg(kg: number): string {
  return `${kg.toLocaleString('hr-HR')} kg`
}

/** Distance (deci-km) and feasibility of serving a single order alone with a truck. */
export function singleOrderCheck(p: Prepared, truck: Truck, i: number): { deci: number; ok: boolean; hours: number } {
  const o = p.orders[i]
  if (o.weightKg > truck.capacityKg || truck.maxItems < 1) return { deci: Infinity, ok: false, hours: Infinity }
  const deci = p.dist[p.base][o.pickup] + p.dist[o.pickup][o.delivery] + p.dist[o.delivery][p.base]
  const t = routeTime(deciToKm(deci), o.handlingMinutes, true, p.settings)
  return { deci, ok: withinLimit(t, p.settings), hours: t.limitedHours }
}

/** Human-readable reason why an order is not in the plan. */
export function explainUnassigned(p: Prepared, i: number, served: number, solver: 'exact' | 'heuristic'): string {
  const { input, orders } = p
  const order = orders[i]
  const maxCapacity = Math.max(...input.trucks.map((t) => t.capacityKg))
  if (order.weightKg > maxCapacity) {
    return `Stroj ${order.machineId} (${formatKg(order.weightKg)}) teži je od nosivosti svih kamiona (najveća ${formatKg(maxCapacity)}).`
  }
  const checks = input.trucks.map((t) => singleOrderCheck(p, t, i))
  if (!checks.some((c) => c.ok)) {
    const shortest = Math.min(...checks.map((c) => c.hours))
    return `Nalog ne stane u radni dan ni kad ga kamion vozi sam (najmanje ${shortest.toFixed(2)} h, limit ${input.settings.maxHoursPerDay} h).`
  }
  if (solver === 'heuristic') {
    return `Zbog dnevnog limita od ${input.settings.maxHoursPerDay} h heuristika nije našla mjesto za ovaj nalog uz ostalih ${served} izvršenih naloga (heuristika ne jamči optimum; za ≤ 12 naloga koristi egzaktni solver).`
  }
  return `Zbog dnevnog limita od ${input.settings.maxHoursPerDay} h kamioni mogu izvršiti najviše ${served} od ${orders.length} naloga; ovaj nalog je izostavljen jer optimalni raspored s najmanje km ne uključuje njega.`
}
