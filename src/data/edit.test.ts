import { describe, expect, it } from 'vitest'
import { solve } from '../solver/solver'
import type { ProblemInput } from '../solver/types'
import { checkInput } from '../solver/validateInput'
import { validatePlan } from '../solver/validatePlan'
import { cloneDefaultInput, emptyInput, isEmptyInput } from './defaultData'
import {
  addLocation,
  addOrder,
  addTruck,
  cannotAddOrderReason,
  clearAll,
  nextTruckId,
  ordersUsingLocation,
  removeLocation,
  removeOrder,
  removeTruck,
  setBase,
} from './edit'

/** Every order points at existing locations and machines; base exists when there are locations. */
function integrityProblems(input: ProblemInput): string[] {
  const locs = new Set(input.locations.map((l) => l.id))
  const machines = new Set(input.machines.map((m) => m.id))
  const p: string[] = []
  for (const o of input.orders) {
    if (!locs.has(o.pickupId)) p.push(`${o.id} pickup`)
    if (!locs.has(o.deliveryId)) p.push(`${o.id} delivery`)
    if (!machines.has(o.machineId)) p.push(`${o.id} machine`)
  }
  if (input.locations.length > 0 && !locs.has(input.baseId)) p.push('base')
  return p
}

describe('F2: building a data set from the empty state', () => {
  it('first location becomes the base L0, next ones L1, L2 ...', () => {
    let input = emptyInput()
    input = addLocation(input)
    input = addLocation(input, { x: 3, y: 8 })
    input = addLocation(input, { x: 10, y: 11 })
    expect(input.locations.map((l) => l.id)).toEqual(['L0', 'L1', 'L2'])
    expect(input.baseId).toBe('L0')
    expect(input.locations[0].name).toBe('Baza')
    expect(input.locations[1]).toMatchObject({ x: 3, y: 8 })
  })

  it('an order needs at least two locations; then it uses non-base locations', () => {
    let input = addLocation(emptyInput())
    expect(cannotAddOrderReason(input)).not.toBeNull()
    expect(addOrder(input)).toBe(input)
    input = addLocation(input)
    input = addLocation(input)
    input = addOrder(input)
    expect(input.orders[0]).toMatchObject({ id: 'N01', machineId: 'M01', pickupId: 'L1', deliveryId: 'L2' })
    expect(input.machines).toEqual([{ id: 'M01', weightKg: 1000 }])
  })

  it('a data set built by hand solves and validates', () => {
    let input = emptyInput()
    input = addTruck(input)
    input = addLocation(input)
    input = addLocation(input, { x: 3, y: 4 })
    input = addLocation(input, { x: 6, y: 8 })
    input = addOrder(input)
    expect(checkInput(input)).toEqual([])
    const plan = solve(input)
    // L0 -> L1 (5) -> L2 (5) -> L0 (10)
    expect(plan.totalKm).toBe(20)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = cloneDefaultInput()
    const snapshot = structuredClone(input)
    addTruck(input)
    addLocation(input)
    addOrder(input)
    removeOrder(input, 'N01')
    removeLocation(input, 'L5', true)
    removeTruck(input, 'A')
    clearAll(input)
    expect(input).toEqual(snapshot)
  })
})

describe('F2: more trucks', () => {
  it('truck ids continue A, B -> C, D ... and names follow', () => {
    const input = addTruck(addTruck(cloneDefaultInput()))
    expect(input.trucks.map((t) => t.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(input.trucks[2].name).toBe('Kamion C')
    expect(nextTruckId(['A', 'C'])).toBe('B')
    const all = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
    expect(nextTruckId(all)).toBe('T27')
  })

  it('removing a truck leaves orders untouched', () => {
    const input = removeTruck(cloneDefaultInput(), 'A')
    expect(input.trucks.map((t) => t.id)).toEqual(['B'])
    expect(input.orders).toHaveLength(10)
  })
})

describe('F2: referential integrity when deleting', () => {
  it('removing an order also removes its machine', () => {
    const input = removeOrder(cloneDefaultInput(), 'N03')
    expect(input.orders.map((o) => o.id)).not.toContain('N03')
    expect(input.machines.map((m) => m.id)).not.toContain('M03')
    expect(integrityProblems(input)).toEqual([])
  })

  it('an unused location is removed at once', () => {
    const input = addLocation(cloneDefaultInput(), { x: 1, y: 1 })
    const r = removeLocation(input, 'L10')
    expect(r.status).toBe('removed')
  })

  it('a used location asks for confirmation and names the orders', () => {
    const input = cloneDefaultInput()
    expect(ordersUsingLocation(input, 'L3')).toEqual(['N01', 'N04', 'N10'])
    const r = removeLocation(input, 'L3')
    expect(r.status).toBe('needs-confirm')
    if (r.status === 'needs-confirm') {
      expect(r.usedBy).toEqual(['N01', 'N04', 'N10'])
      expect(r.message).toContain('L3')
      expect(r.message).toContain('N01, N04, N10')
    }
  })

  it('with confirmation the location and its orders (and machines) are removed', () => {
    const r = removeLocation(cloneDefaultInput(), 'L3', true)
    expect(r.status).toBe('removed')
    if (r.status !== 'removed') return
    expect(r.removedOrders).toEqual(['N01', 'N04', 'N10'])
    expect(r.input.locations.map((l) => l.id)).not.toContain('L3')
    expect(r.input.orders).toHaveLength(7)
    expect(r.input.machines.map((m) => m.id)).not.toContain('M10')
    expect(integrityProblems(r.input)).toEqual([])
    const plan = solve(r.input)
    // cross-checked with tools/reference_check.py logic: all 7 orders on truck B, 154.9 km
    expect(plan.totalKm).toBe(154.9)
    expect(plan.ordersCompleted).toBe(7)
    expect(validatePlan(r.input, plan)).toEqual([])
  })

  it('the base cannot be removed while orders exist, even with confirmation', () => {
    const input = cloneDefaultInput()
    expect(removeLocation(input, 'L0').status).toBe('blocked')
    expect(removeLocation(input, 'L0', true).status).toBe('blocked')
  })

  it('without orders the base can be removed and the next location becomes the base', () => {
    let input = addLocation(addLocation(emptyInput()))
    const r = removeLocation(input, 'L0')
    expect(r.status).toBe('removed')
    if (r.status === 'removed') input = r.input
    expect(input.baseId).toBe('L1')
    const last = removeLocation(input, 'L1')
    expect(last.status === 'removed' && last.input.baseId).toBe('')
  })

  it('another location can be made the base; unknown ids are ignored', () => {
    const input = setBase(cloneDefaultInput(), 'L4')
    expect(input.baseId).toBe('L4')
    expect(setBase(input, 'L99').baseId).toBe('L4')
    expect(checkInput(input)).toEqual([])
  })

  it('random sequences of edits never break integrity', () => {
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    let input = cloneDefaultInput()
    for (let step = 0; step < 300; step++) {
      const op = rnd(6)
      if (op === 0) input = addLocation(input, { x: rnd(20), y: rnd(20) })
      else if (op === 1) input = addOrder(input)
      else if (op === 2 && input.orders.length) input = removeOrder(input, input.orders[rnd(input.orders.length)].id)
      else if (op === 3 && input.locations.length) {
        const r = removeLocation(input, input.locations[rnd(input.locations.length)].id, true)
        if (r.status === 'removed') input = r.input
      } else if (op === 4) input = addTruck(input)
      else if (op === 5 && input.trucks.length > 1) input = removeTruck(input, input.trucks[0].id)
      expect(integrityProblems(input)).toEqual([])
    }
  })
})

describe('F2: Obriši sve', () => {
  it('removes trucks, locations and orders but keeps settings and coordinate mode', () => {
    const input = cloneDefaultInput()
    input.settings.maxHoursPerDay = 8
    input.settings.breakEnabled = true
    const cleared = clearAll(input)
    expect(isEmptyInput(cleared)).toBe(true)
    expect(cleared.machines).toEqual([])
    expect(cleared.baseId).toBe('')
    expect(cleared.coordinateMode).toBe('xy')
    expect(cleared.settings).toEqual(input.settings)
    expect(clearAll({ ...input, coordinateMode: 'geo' }).coordinateMode).toBe('geo')
  })
})

describe('F2: new input check', () => {
  it('rejects an order with the same pickup and delivery location', () => {
    const input = cloneDefaultInput()
    input.orders[0].deliveryId = input.orders[0].pickupId
    expect(checkInput(input)).toEqual(['Nalog N01: preuzimanje i isporuka su na istoj lokaciji (L1).'])
  })
})
