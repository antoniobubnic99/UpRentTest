import { describe, expect, it } from 'vitest'
import { cloneDefaultInput, defaultSettings } from '../data/defaultData'
import { legKm } from './distance'
import { solve } from './solver'
import { routeTime } from './time'
import type { Plan, ProblemInput, TimeLimitMode } from './types'
import { validatePlan } from './validatePlan'
import { InputError } from './validateInput'

const MODES: TimeLimitMode[] = ['drive+handling', 'drive', 'none']

function inputWithMode(mode: TimeLimitMode): ProblemInput {
  const input = cloneDefaultInput()
  input.settings.timeLimitMode = mode
  return input
}

function truck(plan: Plan, id: string) {
  return plan.trucks.find((t) => t.truck.id === id)!
}

describe('distances', () => {
  it('uses Euclidean distance rounded to one decimal per leg', () => {
    const input = cloneDefaultInput()
    const [l0, l1] = input.locations
    expect(legKm(l0, l1)).toBe(8.5) // sqrt(73) = 8.544...
  })
})

describe('business rule 1: capacity and max machines are never exceeded', () => {
  it.each(MODES)('mode %s', (mode) => {
    const input = inputWithMode(mode)
    const plan = solve(input)
    const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
    for (const tp of plan.trucks) {
      let kg = 0
      let count = 0
      for (const s of tp.steps) {
        if (s.action === 'pickup') {
          kg += weight.get(s.machineId!)!
          count++
        }
        if (s.action === 'delivery') {
          kg -= weight.get(s.machineId!)!
          count--
        }
        expect(kg).toBeLessThanOrEqual(tp.truck.capacityKg)
        expect(count).toBeLessThanOrEqual(tp.truck.maxItems)
        expect(s.loadKg).toBe(kg)
        expect(s.loadCount).toBe(count)
      }
    }
    expect(validatePlan(input, plan)).toEqual([])
  })
})

describe('business rule 2: pickup before delivery, by the same truck', () => {
  it.each(MODES)('mode %s', (mode) => {
    const input = inputWithMode(mode)
    const plan = solve(input)
    const deliveredBy = new Map<string, string>()
    for (const tp of plan.trucks) {
      const pickedAt = new Map<string, number>()
      tp.steps.forEach((s, i) => {
        if (s.action === 'pickup') pickedAt.set(s.orderId!, i)
        if (s.action === 'delivery') {
          expect(pickedAt.has(s.orderId!)).toBe(true)
          expect(pickedAt.get(s.orderId!)!).toBeLessThan(i)
          expect(deliveredBy.has(s.orderId!)).toBe(false)
          deliveredBy.set(s.orderId!, tp.truck.id)
        }
      })
      // every picked order is also delivered by this truck
      expect([...pickedAt.keys()].every((id) => deliveredBy.get(id) === tp.truck.id)).toBe(true)
    }
    // every order is either served exactly once or reported as unassigned
    const unassigned = plan.unassigned.map((u) => u.orderId)
    for (const o of input.orders) {
      expect(deliveredBy.has(o.id) !== unassigned.includes(o.id)).toBe(true)
    }
  })
})

describe('business rule 3: every route starts and ends at the base', () => {
  it.each(MODES)('mode %s', (mode) => {
    const plan = solve(inputWithMode(mode))
    for (const tp of plan.trucks) {
      expect(tp.steps[0]).toMatchObject({ action: 'start', locationId: 'L0' })
      expect(tp.steps.at(-1)).toMatchObject({ action: 'return', locationId: 'L0', loadCount: 0 })
    }
  })
})

describe('business rule 4: 9 h daily limit and reference optimum', () => {
  it('drive + handling: 200.1 km, A takes N03, all within 9 h', () => {
    const input = cloneDefaultInput()
    const plan = solve(input)
    expect(plan.totalKm).toBe(200.1)
    expect(plan.ordersCompleted).toBe(10)
    expect(plan.unassigned).toEqual([])
    expect(truck(plan, 'A').orderIds).toEqual(['N03'])
    expect(truck(plan, 'A').totalKm).toBe(37.2)
    expect(truck(plan, 'B').totalKm).toBe(162.9)
    for (const tp of plan.trucks) expect(tp.totalHours).toBeLessThanOrEqual(9)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('without the limit the optimum is 182.2 km and truck B alone would need 9.7 h', () => {
    const plan = solve(inputWithMode('none'))
    expect(plan.totalKm).toBe(182.2)
    expect(truck(plan, 'B').ordersCompleted).toBe(10)
    expect(truck(plan, 'B').totalHours).toBeGreaterThan(9)
  })

  it('driving-time-only limit gives the same 182.2 km (3.04 h of driving)', () => {
    const plan = solve(inputWithMode('drive'))
    expect(plan.totalKm).toBe(182.2)
    expect(truck(plan, 'B').driveHours).toBeLessThanOrEqual(9)
  })

  it('reports orders that cannot fit into a working day instead of dropping them silently', () => {
    const input = cloneDefaultInput()
    input.settings.maxHoursPerDay = 2
    const plan = solve(input)
    expect(plan.unassigned.length).toBeGreaterThan(0)
    for (const u of plan.unassigned) expect(u.reason.length).toBeGreaterThan(0)
    for (const tp of plan.trucks)
      expect(tp.limitedHours).toBeLessThanOrEqual(2 + 1e-9)
    expect(validatePlan(input, plan)).toEqual([])
  })
})

describe('business rule 5: impossible orders produce a clear warning', () => {
  it('machine heavier than every truck is unassigned, the rest is still optimised', () => {
    const input = cloneDefaultInput()
    input.machines.push({ id: 'M11', weightKg: 12000 })
    input.orders.push({ id: 'N11', machineId: 'M11', pickupId: 'L1', deliveryId: 'L2' })
    const plan = solve(input)
    expect(plan.unassigned).toHaveLength(1)
    expect(plan.unassigned[0].orderId).toBe('N11')
    expect(plan.unassigned[0].reason).toMatch(/nosivosti svih kamiona/)
    expect(plan.totalKm).toBe(200.1)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('rejects invalid input with a readable error', () => {
    const input = cloneDefaultInput()
    input.orders[0].pickupId = 'L99'
    expect(() => solve(input)).toThrow(InputError)
  })
})

// ---------------------------------------------------------------------------
// Optimality: compare with a naive brute force on small random instances.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInput(seed: number, nOrders: number): ProblemInput {
  const rnd = mulberry32(seed)
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
  const locations = Array.from({ length: 6 }, (_, i) => ({
    id: `L${i}`,
    name: `L${i}`,
    x: i === 0 ? 0 : int(-30, 30),
    y: i === 0 ? 0 : int(-30, 30),
  }))
  const machines = Array.from({ length: nOrders }, (_, i) => ({ id: `M${i}`, weightKg: int(5, 60) * 100 }))
  const orders = machines.map((m, i) => {
    const p = int(0, 5)
    let d = int(0, 5)
    if (d === p) d = (d + 1) % 6
    return { id: `N${i}`, machineId: m.id, pickupId: `L${p}`, deliveryId: `L${d}` }
  })
  return {
    coordinateMode: 'xy',
    baseId: 'L0',
    trucks: [
      { id: 'A', name: 'A', capacityKg: 3500, maxItems: 2 },
      { id: 'B', name: 'B', capacityKg: 8000, maxItems: 2 },
    ],
    machines,
    locations,
    orders,
    settings: { ...defaultSettings, maxHoursPerDay: 4 },
  }
}

/** Naive reference: try every assignment and every action order. Returns [served, deci-km]. */
function bruteForce(input: ProblemInput): [number, number] {
  const loc = new Map(input.locations.map((l) => [l.id, l]))
  const w = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const d = (a: string, b: string) => Math.round(legKm(loc.get(a)!, loc.get(b)!) * 10)
  const n = input.orders.length

  const bestRoute = (truckIdx: number, idxs: number[]): number => {
    const t = input.trucks[truckIdx]
    let best = Infinity
    const state = idxs.map(() => 0)
    const dfs = (at: string, kg: number, cnt: number, cost: number, done: number) => {
      if (done === idxs.length * 2) {
        best = Math.min(best, cost + d(at, input.baseId))
        return
      }
      idxs.forEach((oi, k) => {
        const o = input.orders[oi]
        const ow = w.get(o.machineId)!
        if (state[k] === 0 && kg + ow <= t.capacityKg && cnt < t.maxItems) {
          state[k] = 1
          dfs(o.pickupId, kg + ow, cnt + 1, cost + d(at, o.pickupId), done + 1)
          state[k] = 0
        } else if (state[k] === 1) {
          state[k] = 2
          dfs(o.deliveryId, kg - ow, cnt - 1, cost + d(at, o.deliveryId), done + 1)
          state[k] = 1
        }
      })
    }
    dfs(input.baseId, 0, 0, 0, 0)
    if (!Number.isFinite(best)) return Infinity
    return routeTime(best / 10, idxs.length * 40, idxs.length > 0, input.settings).limitedHours <= input.settings.maxHoursPerDay + 1e-9
      ? best
      : Infinity
  }

  let bestServed = -1
  let bestCost = Infinity
  const total = 3 ** n
  for (let code = 0; code < total; code++) {
    const groups: number[][] = [[], []]
    let c = code
    let served = 0
    for (let i = 0; i < n; i++, c = Math.floor(c / 3)) {
      const g = c % 3
      if (g < 2) {
        groups[g].push(i)
        served++
      }
    }
    if (served < bestServed) continue
    const cost = bestRoute(0, groups[0]) + bestRoute(1, groups[1])
    if (!Number.isFinite(cost)) continue
    if (served > bestServed || cost < bestCost) {
      bestServed = served
      bestCost = cost
    }
  }
  return [bestServed, bestCost]
}

describe('optimality: exact solver matches brute force', () => {
  it.each(Array.from({ length: 25 }, (_, i) => i + 1))('random instance #%i', (seed) => {
    const input = randomInput(seed, 4)
    const plan = solve(input)
    const [served, deci] = bruteForce(input)
    expect(plan.ordersCompleted).toBe(served)
    expect(Math.round(plan.totalKm * 10)).toBe(deci)
    expect(validatePlan(input, plan)).toEqual([])
  })
})
