import { tr } from '../i18n'
import type { ProblemInput } from './types'

/** Above this many orders the exact solver is too slow; 'auto' switches to the heuristic (D3). */
export const MAX_EXACT_ORDERS = 12

export class InputError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(problems.join('\n'))
    this.name = 'InputError'
    this.problems = problems
  }
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dup.add(id)
    seen.add(id)
  }
  return [...dup]
}

/** Returns a list of problems with the input; an empty list means the input is usable. */
export function checkInput(input: ProblemInput): string[] {
  const problems: string[] = []
  const locIds = new Set(input.locations.map((l) => l.id))
  const machineIds = new Set(input.machines.map((m) => m.id))

  for (const [key, ids] of [
    ['in.dupLocations', input.locations.map((l) => l.id)],
    ['in.dupMachines', input.machines.map((m) => m.id)],
    ['in.dupOrders', input.orders.map((o) => o.id)],
    ['in.dupTrucks', input.trucks.map((t) => t.id)],
  ] as const) {
    const dup = duplicates([...ids])
    if (dup.length) problems.push(tr(key, { ids: dup.join(', ') }))
  }

  if (input.locations.length === 0) problems.push(tr('in.noLocations'))
  else if (!locIds.has(input.baseId)) problems.push(tr('in.noBase', { id: input.baseId }))
  if (input.trucks.length === 0) problems.push(tr('in.noTrucks'))
  if (input.orders.length === 0) problems.push(tr('in.noOrders'))

  for (const t of input.trucks) {
    if (!(t.capacityKg > 0)) problems.push(tr('in.capacity', { name: t.name }))
    if (!Number.isInteger(t.maxItems) || t.maxItems < 1)
      problems.push(tr('in.maxItems', { name: t.name }))
  }
  for (const m of input.machines) {
    if (!(m.weightKg > 0)) problems.push(tr('in.weight', { id: m.id }))
  }
  for (const l of input.locations) {
    if (input.coordinateMode === 'geo') {
      const latOk = Number.isFinite(l.lat) && Math.abs(l.lat!) <= 90
      const lonOk = Number.isFinite(l.lon) && Math.abs(l.lon!) <= 180
      if (!latOk || !lonOk)
        problems.push(tr('in.latLon', { id: l.id }))
    } else if (!Number.isFinite(l.x) || !Number.isFinite(l.y)) {
      problems.push(tr('in.xy', { id: l.id }))
    }
  }

  const usedMachines = new Set<string>()
  for (const o of input.orders) {
    if (!machineIds.has(o.machineId)) problems.push(tr('in.orderMachine', { id: o.id, machine: o.machineId }))
    if (!locIds.has(o.pickupId)) problems.push(tr('in.orderPickup', { id: o.id, loc: o.pickupId }))
    if (!locIds.has(o.deliveryId)) problems.push(tr('in.orderDelivery', { id: o.id, loc: o.deliveryId }))
    if (o.pickupId === o.deliveryId)
      problems.push(tr('in.orderSame', { id: o.id, loc: o.pickupId }))
    for (const [key, v] of [
      ['in.orderPickupMin', o.pickupMinutes],
      ['in.orderDeliveryMin', o.deliveryMinutes],
    ] as const) {
      if (v !== undefined && !(Number.isFinite(v) && v >= 0)) problems.push(tr(key, { id: o.id }))
    }
    if (usedMachines.has(o.machineId))
      problems.push(tr('in.machineTwice', { id: o.machineId }))
    usedMachines.add(o.machineId)
  }

  const s = input.settings
  if (!(s.speedKmh > 0)) problems.push(tr('in.speed'))
  if (!(s.handlingMinutes >= 0)) problems.push(tr('in.handling'))
  if (!(s.maxHoursPerDay > 0)) problems.push(tr('in.limit'))
  if (s.breakEnabled && !(s.breakMinutes >= 0)) problems.push(tr('in.break'))
  if (input.coordinateMode === 'geo' && s.distanceSource === 'road' && input.roadMatrix) {
    const known = new Set(input.roadMatrix.ids)
    const missing = input.locations.filter((l) => !known.has(l.id)).map((l) => l.id)
    if (missing.length) problems.push(tr('in.roadMissing', { ids: missing.join(', ') }))
    if (input.roadMatrix.km.some((row) => row.some((v) => !Number.isFinite(v) || v < 0)))
      problems.push(tr('in.roadNoPath'))
    if (input.roadMatrix.minutes?.some((row) => row.some((v) => !Number.isFinite(v) || v < 0)))
      problems.push(tr('in.roadNoTime'))
  }
  if (s.balanceMaxExtraPct !== undefined && !(s.balanceMaxExtraPct >= 0))
    problems.push(tr('in.balancePct'))
  if (s.truckMaxSpeedKmh !== undefined && !(s.truckMaxSpeedKmh > 0))
    problems.push(tr('in.truckMax'))
  if (input.coordinateMode === 'geo' && !(s.roadFactor >= 1))
    problems.push(tr('in.roadFactor'))

  return problems
}
