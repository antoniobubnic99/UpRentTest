import { tr } from '../i18n'
import { distanceOptions, legKm, legSeconds, usesLegTimes } from './distance'
import { routeTimeFromDrive, withinLimit } from './time'
import type { Plan, ProblemInput } from './types'

/**
 * Independent checker of all business rules on a finished plan.
 * It does not trust the solver: it replays every route step by step.
 * Returns a list of violations; an empty list means the plan is valid.
 */
export function validatePlan(input: ProblemInput, plan: Plan): string[] {
  const v: string[] = []
  const loc = new Map(input.locations.map((l) => [l.id, l]))
  const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const orderById = new Map(input.orders.map((o) => [o.id, o]))
  const servedBy = new Map<string, string>()
  const distOpts = distanceOptions(input)
  const legTimes = usesLegTimes(input)

  for (const tp of plan.trucks) {
    const { truck, steps } = tp
    const name = truck.name
    if (steps.length < 2) {
      v.push(tr('val.short', { name }))
      continue
    }
    const first = steps[0]
    const last = steps[steps.length - 1]
    if (first.action !== 'start' || first.locationId !== input.baseId)
      v.push(tr('val.start', { name, base: input.baseId }))
    if (last.action !== 'return' || last.locationId !== input.baseId)
      v.push(tr('val.end', { name, base: input.baseId }))

    let loadKg = 0
    let loadCount = 0
    let km = 0
    let sec = 0
    let actions = 0
    let handlingMin = 0
    let breaks = 0
    const onBoard = new Set<string>()
    const picked = new Set<string>()
    const delivered = new Set<string>()

    for (let i = 1; i < steps.length; i++) {
      const s = steps[i]
      if (s.action === 'break') {
        breaks++
        if (s.legKm !== 0 || s.locationId !== steps[i - 1].locationId)
          v.push(tr('val.breakMove', { name, i }))
        continue
      }
      const from = loc.get(steps[i - 1].locationId)!
      const to = loc.get(s.locationId)!
      const expectedLeg = legKm(from, to, distOpts)
      if (Math.abs(expectedLeg - s.legKm) > 1e-9)
        v.push(tr('val.leg', { name, i, km: s.legKm, expected: expectedLeg }))
      km = Math.round((km + expectedLeg) * 10) / 10
      const legSec = legSeconds(from, to, expectedLeg, distOpts)
      sec += legSec
      const expectedHours = legTimes ? legSec / 3600 : expectedLeg / input.settings.speedKmh
      if (Math.abs(s.arrivalHours - steps[i - 1].departureHours - expectedHours) > 1e-6)
        v.push(tr('val.legTime', { name, i }))

      if (s.action === 'pickup' || s.action === 'delivery') {
        actions++
        const order = s.orderId ? orderById.get(s.orderId) : undefined
        if (!order) {
          v.push(tr('val.unknownOrder', { name, i, id: String(s.orderId) }))
          continue
        }
        const w = weight.get(order.machineId)!
        handlingMin +=
          (s.action === 'pickup' ? order.pickupMinutes : order.deliveryMinutes) ?? input.settings.handlingMinutes
        if (s.action === 'pickup') {
          if (s.locationId !== order.pickupId)
            v.push(tr('val.pickupAt', { name, id: order.id, at: s.locationId, expected: order.pickupId }))
          if (picked.has(order.id)) v.push(tr('val.pickedTwice', { name, id: order.id }))
          picked.add(order.id)
          onBoard.add(order.id)
          loadKg += w
          loadCount++
        } else {
          if (s.locationId !== order.deliveryId)
            v.push(tr('val.deliveryAt', { name, id: order.id, at: s.locationId, expected: order.deliveryId }))
          if (!onBoard.has(order.id))
            v.push(tr('val.deliveredBefore', { name, id: order.id }))
          onBoard.delete(order.id)
          delivered.add(order.id)
          loadKg -= w
          loadCount--
        }
        if (loadKg > truck.capacityKg)
          v.push(tr('val.overweight', { name, i, kg: loadKg, cap: truck.capacityKg }))
        if (loadCount > truck.maxItems)
          v.push(tr('val.overcount', { name, i, n: loadCount, max: truck.maxItems }))
        if (s.loadKg !== loadKg || s.loadCount !== loadCount)
          v.push(tr('val.loadShown', { name, i }))
      }
    }

    if (onBoard.size) v.push(tr('val.returnsLoaded', { name, ids: [...onBoard].join(', ') }))
    for (const id of delivered) {
      if (servedBy.has(id)) v.push(tr('val.servedTwice', { id }))
      servedBy.set(id, truck.id)
    }
    if (Math.abs(km - tp.totalKm) > 1e-9)
      v.push(tr('val.totalKm', { name, total: tp.totalKm, sum: km }))
    const hasOrders = actions > 0
    const expectedBreaks = input.settings.breakEnabled && hasOrders ? 1 : 0
    if (breaks !== expectedBreaks)
      v.push(tr('val.breaks', { name, n: breaks, expected: expectedBreaks }))
    const driveHours = legTimes ? sec / 3600 : km / input.settings.speedKmh
    const time = routeTimeFromDrive(driveHours, handlingMin, hasOrders, input.settings)
    if (!withinLimit(time, input.settings))
      v.push(tr('val.overLimit', { name, limit: input.settings.maxHoursPerDay }))
    if (Math.abs(last.arrivalHours - time.totalHours) > 1e-6 || Math.abs(tp.totalHours - time.totalHours) > 1e-6)
      v.push(tr('val.timeShown', { name }))
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].arrivalHours < steps[i - 1].departureHours - 1e-9 || steps[i].departureHours < steps[i].arrivalHours - 1e-9)
        v.push(tr('val.times', { name, i }))
    }
  }

  const unassigned = new Set(plan.unassigned.map((u) => u.orderId))
  for (const o of input.orders) {
    const served = servedBy.has(o.id)
    if (served && unassigned.has(o.id)) v.push(tr('val.bothServed', { id: o.id }))
    if (!served && !unassigned.has(o.id)) v.push(tr('val.silent', { id: o.id }))
  }
  return v
}
