import type { ProblemInput, Truck } from '../solver/types'
import { emptyInput } from './defaultData'

/**
 * Pure editing operations on the problem input. Every function returns a new
 * ProblemInput (never mutates its argument) and keeps referential integrity:
 * no order may point at a missing location or machine.
 */

/** Smallest free id of the form PREFIX + zero-padded number, starting from `start`. */
export function nextId(prefix: string, ids: string[], start = 1, pad = 2): string {
  const taken = new Set(ids)
  for (let i = start; ; i++) {
    const id = `${prefix}${String(i).padStart(pad, '0')}`
    if (!taken.has(id)) return id
  }
}

/** Truck ids follow the task: A, B, C ... Z, then T27, T28 ... */
export function nextTruckId(ids: string[]): string {
  const taken = new Set(ids)
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i)
    if (!taken.has(id)) return id
  }
  return nextId('T', ids, 27)
}

export function addTruck(input: ProblemInput, truck?: Partial<Truck>): ProblemInput {
  const id = truck?.id ?? nextTruckId(input.trucks.map((t) => t.id))
  const added: Truck = {
    id,
    name: truck?.name ?? `Kamion ${id}`,
    capacityKg: truck?.capacityKg ?? 3500,
    maxItems: truck?.maxItems ?? 2,
  }
  return { ...input, trucks: [...input.trucks, added] }
}

/** Trucks are not referenced by orders, so a truck can always be removed. */
export function removeTruck(input: ProblemInput, id: string): ProblemInput {
  return { ...input, trucks: input.trucks.filter((t) => t.id !== id) }
}

/**
 * Adds a location. The first location of an empty data set becomes the base (L0, "Baza");
 * the next ones get L1, L2 ... In 'xy' mode the new location starts at (0, 0).
 */
export function addLocation(
  input: ProblemInput,
  fields: { name?: string; x?: number; y?: number; lat?: number; lon?: number; address?: string } = {},
): ProblemInput {
  const ids = input.locations.map((l) => l.id)
  const isFirst = input.locations.length === 0
  const id = isFirst ? 'L0' : nextId('L', ids, 1, 1)
  const base = { id, name: fields.name ?? (isFirst ? 'Baza' : id) }
  const location =
    input.coordinateMode === 'geo'
      ? { ...base, lat: fields.lat, lon: fields.lon, address: fields.address }
      : { ...base, x: fields.x ?? 0, y: fields.y ?? 0 }
  return {
    ...input,
    baseId: input.baseId && ids.includes(input.baseId) ? input.baseId : id,
    locations: [...input.locations, location],
  }
}

/** Ids of orders that pick up or deliver at the location. */
export function ordersUsingLocation(input: ProblemInput, locationId: string): string[] {
  return input.orders.filter((o) => o.pickupId === locationId || o.deliveryId === locationId).map((o) => o.id)
}

export type RemoveLocationResult =
  | { status: 'removed'; input: ProblemInput; removedOrders: string[] }
  | { status: 'needs-confirm'; usedBy: string[]; message: string }
  | { status: 'blocked'; message: string }

/**
 * Removes a location.
 * - The base cannot be removed while any order exists (every route starts and ends there).
 * - A location used by orders is removed only with `cascade`, which also removes those orders.
 *   Without it the caller gets a message to show in a confirmation.
 */
export function removeLocation(input: ProblemInput, id: string, cascade = false): RemoveLocationResult {
  if (id === input.baseId && input.orders.length > 0) {
    return {
      status: 'blocked',
      message: `Baza ${id} se ne može obrisati dok postoje nalozi. Sve rute počinju i završavaju u bazi; najprije odaberi drugu bazu ili obriši naloge.`,
    }
  }
  const usedBy = ordersUsingLocation(input, id)
  if (usedBy.length > 0 && !cascade) {
    return {
      status: 'needs-confirm',
      usedBy,
      message: `Lokacija ${id} se koristi u ${usedBy.length === 1 ? 'nalogu' : 'nalozima'} ${usedBy.join(', ')}. Obrisati lokaciju i ${usedBy.length === 1 ? 'taj nalog' : 'te naloge'}?`,
    }
  }
  let next: ProblemInput = input
  for (const orderId of usedBy) next = removeOrder(next, orderId)
  const locations = next.locations.filter((l) => l.id !== id)
  const baseId = next.baseId === id ? (locations[0]?.id ?? '') : next.baseId
  return { status: 'removed', input: { ...next, locations, baseId }, removedOrders: usedBy }
}

export function setBase(input: ProblemInput, id: string): ProblemInput {
  if (!input.locations.some((l) => l.id === id)) return input
  return { ...input, baseId: id }
}

/** Why a new order cannot be added yet, or null when it can. */
export function cannotAddOrderReason(input: ProblemInput): string | null {
  if (input.locations.length < 2) return 'Za nalog trebaju barem dvije lokacije (preuzimanje i isporuka).'
  return null
}

/**
 * Adds an order with its own new machine (1000 kg). Pickup and delivery default to the
 * first two non-base locations, falling back to the base, so they always exist.
 */
export function addOrder(input: ProblemInput): ProblemInput {
  if (cannotAddOrderReason(input)) return input
  const machineId = nextId('M', input.machines.map((m) => m.id))
  const nonBase = input.locations.filter((l) => l.id !== input.baseId).map((l) => l.id)
  const pickupId = nonBase[0] ?? input.baseId
  const deliveryId = nonBase[1] ?? input.baseId
  return {
    ...input,
    machines: [...input.machines, { id: machineId, weightKg: 1000 }],
    orders: [...input.orders, { id: nextId('N', input.orders.map((o) => o.id)), machineId, pickupId, deliveryId }],
  }
}

/** Removes an order and its machine when no other order uses that machine. */
export function removeOrder(input: ProblemInput, id: string): ProblemInput {
  const order = input.orders.find((o) => o.id === id)
  if (!order) return input
  const orders = input.orders.filter((o) => o.id !== id)
  const machines = orders.some((o) => o.machineId === order.machineId)
    ? input.machines
    : input.machines.filter((m) => m.id !== order.machineId)
  return { ...input, orders, machines }
}

/** "Obriši sve": removes trucks, locations and orders; keeps the coordinate mode and the settings. */
export function clearAll(input: ProblemInput): ProblemInput {
  return { ...emptyInput(input.coordinateMode), settings: { ...input.settings } }
}
