import { distanceOptions, legKm } from './distance'
import { routeTime, withinLimit } from './time'
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

  for (const tp of plan.trucks) {
    const { truck, steps } = tp
    const name = truck.name
    if (steps.length < 2) {
      v.push(`${name}: ruta mora imati barem polazak i povratak.`)
      continue
    }
    const first = steps[0]
    const last = steps[steps.length - 1]
    if (first.action !== 'start' || first.locationId !== input.baseId)
      v.push(`${name}: ruta ne kreće iz baze ${input.baseId}.`)
    if (last.action !== 'return' || last.locationId !== input.baseId)
      v.push(`${name}: ruta se ne vraća u bazu ${input.baseId}.`)

    let loadKg = 0
    let loadCount = 0
    let km = 0
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
          v.push(`${name}, korak ${i}: pauza mora biti na mjestu, bez vožnje.`)
        continue
      }
      const expectedLeg = legKm(loc.get(steps[i - 1].locationId)!, loc.get(s.locationId)!, distOpts)
      if (Math.abs(expectedLeg - s.legKm) > 1e-9)
        v.push(`${name}, korak ${i}: dionica ${s.legKm} km, očekivano ${expectedLeg} km.`)
      km = Math.round((km + expectedLeg) * 10) / 10

      if (s.action === 'pickup' || s.action === 'delivery') {
        actions++
        const order = s.orderId ? orderById.get(s.orderId) : undefined
        if (!order) {
          v.push(`${name}, korak ${i}: nepoznat nalog ${s.orderId}.`)
          continue
        }
        const w = weight.get(order.machineId)!
        handlingMin +=
          (s.action === 'pickup' ? order.pickupMinutes : order.deliveryMinutes) ?? input.settings.handlingMinutes
        if (s.action === 'pickup') {
          if (s.locationId !== order.pickupId)
            v.push(`${name}: ${order.id} preuzet na ${s.locationId}, a treba na ${order.pickupId}.`)
          if (picked.has(order.id)) v.push(`${name}: ${order.id} preuzet više puta.`)
          picked.add(order.id)
          onBoard.add(order.id)
          loadKg += w
          loadCount++
        } else {
          if (s.locationId !== order.deliveryId)
            v.push(`${name}: ${order.id} isporučen na ${s.locationId}, a treba na ${order.deliveryId}.`)
          if (!onBoard.has(order.id))
            v.push(`${name}: ${order.id} isporučen prije preuzimanja ili ga ovaj kamion nije preuzeo.`)
          onBoard.delete(order.id)
          delivered.add(order.id)
          loadKg -= w
          loadCount--
        }
        if (loadKg > truck.capacityKg)
          v.push(`${name}, korak ${i}: opterećenje ${loadKg} kg > nosivost ${truck.capacityKg} kg.`)
        if (loadCount > truck.maxItems)
          v.push(`${name}, korak ${i}: ${loadCount} strojeva > maksimum ${truck.maxItems}.`)
        if (s.loadKg !== loadKg || s.loadCount !== loadCount)
          v.push(`${name}, korak ${i}: prikazano opterećenje ne odgovara stvarnom.`)
      }
    }

    if (onBoard.size) v.push(`${name}: vraća se u bazu sa strojevima ${[...onBoard].join(', ')}.`)
    for (const id of delivered) {
      if (servedBy.has(id)) v.push(`${id} izvršava više kamiona.`)
      servedBy.set(id, truck.id)
    }
    if (Math.abs(km - tp.totalKm) > 1e-9)
      v.push(`${name}: ukupno ${tp.totalKm} km, zbroj dionica je ${km} km.`)
    const hasOrders = actions > 0
    const expectedBreaks = input.settings.breakEnabled && hasOrders ? 1 : 0
    if (breaks !== expectedBreaks)
      v.push(`${name}: ${breaks} pauza u ruti, očekivano ${expectedBreaks}.`)
    const time = routeTime(km, handlingMin, hasOrders, input.settings)
    if (!withinLimit(time, input.settings))
      v.push(`${name}: prekoračen dnevni limit od ${input.settings.maxHoursPerDay} h.`)
    if (Math.abs(last.arrivalHours - time.totalHours) > 1e-6 || Math.abs(tp.totalHours - time.totalHours) > 1e-6)
      v.push(`${name}: prikazano radno vrijeme ne odgovara zbroju vožnje, utovara/istovara i pauze.`)
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].arrivalHours < steps[i - 1].departureHours - 1e-9 || steps[i].departureHours < steps[i].arrivalHours - 1e-9)
        v.push(`${name}, korak ${i}: vremena dolaska i odlaska nisu u redu.`)
    }
  }

  const unassigned = new Set(plan.unassigned.map((u) => u.orderId))
  for (const o of input.orders) {
    const served = servedBy.has(o.id)
    if (served && unassigned.has(o.id)) v.push(`${o.id} je i izvršen i označen kao neraspoređen.`)
    if (!served && !unassigned.has(o.id)) v.push(`${o.id} nije izvršen, a nema upozorenja.`)
  }
  return v
}
