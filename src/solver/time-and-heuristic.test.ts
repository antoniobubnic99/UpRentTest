import { describe, expect, it } from 'vitest'
import { cloneDefaultInput, defaultSettings } from '../data/defaultData'
import { legKm } from './distance'
import { solve } from './solver'
import { routeTime } from './time'
import type { Plan, ProblemInput, SolverMode } from './types'
import { InputError, MAX_EXACT_ORDERS } from './validateInput'
import { validatePlan } from './validatePlan'

function truck(plan: Plan, id: string) {
  return plan.trucks.find((t) => t.truck.id === id)!
}

/** Deterministic pseudo-random instance on a 40 x 40 grid. */
function randomInput(seed: number, n: number, trucks: number, maxHours: number): ProblemInput {
  let s = seed
  const r = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const numLocs = Math.min(2 * n + 1, 40)
  const locations = Array.from({ length: numLocs }, (_, i) => ({
    id: `L${i}`,
    name: `L${i}`,
    x: i === 0 ? 0 : Math.round(r() * 40 - 20),
    y: i === 0 ? 0 : Math.round(r() * 40 - 20),
  }))
  const machines = Array.from({ length: n }, (_, i) => ({ id: `M${i}`, weightKg: 500 + Math.round(r() * 7000) }))
  const orders = machines.map((m, i) => {
    const p = 1 + Math.floor(r() * (numLocs - 1))
    let d = Math.floor(r() * numLocs)
    if (d === p) d = 0
    return { id: `N${i}`, machineId: m.id, pickupId: `L${p}`, deliveryId: `L${d}` }
  })
  return {
    coordinateMode: 'xy',
    baseId: 'L0',
    locations,
    machines,
    orders,
    trucks: Array.from({ length: trucks }, (_, i) => ({
      id: `T${i}`,
      name: `T${i}`,
      capacityKg: i % 2 ? 9000 : 4000,
      maxItems: 2 + (i % 2),
    })),
    settings: { ...defaultSettings, maxHoursPerDay: maxHours },
  }
}

function withSolver(input: ProblemInput, solverMode: SolverMode): ProblemInput {
  return { ...input, settings: { ...input.settings, solverMode } }
}

describe('F4: mandatory break (decision D1)', () => {
  it('off by default: task data gives 200.1 km and no break steps', () => {
    const input = cloneDefaultInput()
    const plan = solve(input)
    expect(plan.totalKm).toBe(200.1)
    expect(plan.trucks.flatMap((t) => t.steps).some((s) => s.action === 'break')).toBe(false)
  })

  it('30 min break on: 217.0 km (A: N01 + N04, 41.7 km; B: other 8 orders, 175.3 km, 8 h 45 min)', () => {
    const input = cloneDefaultInput()
    input.settings.breakEnabled = true
    const plan = solve(input)
    expect(plan.totalKm).toBe(217)
    expect(plan.ordersCompleted).toBe(10)
    expect(truck(plan, 'A').orderIds).toEqual(['N01', 'N04'])
    expect(truck(plan, 'A').totalKm).toBe(41.7)
    expect(truck(plan, 'B').totalKm).toBe(175.3)
    expect(Math.round(truck(plan, 'B').totalHours * 60)).toBe(525) // 8 h 45 min
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('every truck with orders gets exactly one 30 min break, without driving', () => {
    const input = cloneDefaultInput()
    input.settings.breakEnabled = true
    for (const tp of solve(input).trucks) {
      const breaks = tp.steps.filter((s) => s.action === 'break')
      expect(breaks).toHaveLength(tp.ordersCompleted > 0 ? 1 : 0)
      for (const b of breaks) {
        expect(b.legKm).toBe(0)
        expect(b.departureHours - b.arrivalHours).toBeCloseTo(0.5, 9)
      }
      expect(tp.breakHours).toBe(tp.ordersCompleted > 0 ? 0.5 : 0)
    }
  })

  it('a truck without orders gets no break', () => {
    const input = cloneDefaultInput()
    input.settings.breakEnabled = true
    input.trucks.push({ id: 'C', name: 'Kamion C', capacityKg: 500, maxItems: 1 }) // too small for any machine
    const plan = solve(input)
    expect(truck(plan, 'C').ordersCompleted).toBe(0)
    expect(truck(plan, 'C').breakHours).toBe(0)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('"samo vožnja" does not count the break: still 182.2 km', () => {
    const input = cloneDefaultInput()
    input.settings.breakEnabled = true
    input.settings.timeLimitMode = 'drive'
    expect(solve(input).totalKm).toBe(182.2)
  })

  it('validator catches a missing break', () => {
    const input = cloneDefaultInput()
    input.settings.breakEnabled = true
    const plan = solve(input)
    const tampered = structuredClone(plan)
    tampered.trucks[1].steps = tampered.trucks[1].steps.filter((s) => s.action !== 'break')
    expect(validatePlan(input, tampered).some((v) => v.includes('pauza'))).toBe(true)
  })
})

describe('F4: loading / unloading time per order (requirement 6)', () => {
  it('route time uses each order\'s own minutes', () => {
    const t = routeTime(60, 20 + 20 + 90 + 20, true, defaultSettings)
    expect(t.driveHours).toBe(1)
    expect(t.handlingHours).toBeCloseTo(150 / 60, 12)
    expect(t.limitedHours).toBeCloseTo(1 + 2.5, 12)
  })

  it('longer loading of N09 (60 min) changes the optimum to 217.0 km, as in the Python reference', () => {
    const input = cloneDefaultInput()
    input.orders.find((o) => o.id === 'N09')!.pickupMinutes = 60
    const plan = solve(input)
    expect(plan.totalKm).toBe(217)
    expect(truck(plan, 'A').orderIds).toEqual(['N01', 'N04'])
    expect(validatePlan(input, plan)).toEqual([])
    const pickup = truck(plan, 'B').steps.find((s) => s.orderId === 'N09' && s.action === 'pickup')!
    expect(Math.round((pickup.departureHours - pickup.arrivalHours) * 60)).toBe(60)
  })

  it('an order that alone does not fit into the day is reported with a reason', () => {
    const input = cloneDefaultInput()
    input.orders.find((o) => o.id === 'N05')!.deliveryMinutes = 9 * 60
    const plan = solve(input)
    const u = plan.unassigned.find((x) => x.orderId === 'N05')
    expect(u?.reason).toContain('ne stane u radni dan')
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('validator recomputes handling per order (tampered time is caught)', () => {
    const input = cloneDefaultInput()
    input.orders[0].pickupMinutes = 45
    const plan = solve(input)
    const tampered = structuredClone(plan)
    tampered.trucks[1].totalHours -= 0.25
    expect(validatePlan(input, plan)).toEqual([])
    expect(validatePlan(input, tampered).length).toBeGreaterThan(0)
  })
})

describe('F4: arrival and departure times', () => {
  it('times follow legs and handling; return arrival equals total working time', () => {
    const input = cloneDefaultInput()
    input.settings.breakEnabled = true
    const plan = solve(input)
    for (const tp of plan.trucks) {
      for (let i = 1; i < tp.steps.length; i++) {
        const prev = tp.steps[i - 1]
        const s = tp.steps[i]
        expect(s.arrivalHours).toBeCloseTo(prev.departureHours + s.legKm / 60, 9)
      }
      expect(tp.steps[tp.steps.length - 1].arrivalHours).toBeCloseTo(tp.totalHours, 9)
    }
  })
})

/** Brute force for any number of trucks: every assignment, every action order. Returns [served, deci-km]. */
function bruteForce(input: ProblemInput): [number, number] {
  const loc = new Map(input.locations.map((l) => [l.id, l]))
  const w = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const d = (a: string, b: string) => Math.round(legKm(loc.get(a)!, loc.get(b)!) * 10)
  const T = input.trucks.length
  const n = input.orders.length

  const bestRoute = (t: number, idxs: number[]): number => {
    if (idxs.length === 0) return 0
    const tr = input.trucks[t]
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
        if (state[k] === 0 && kg + ow <= tr.capacityKg && cnt < tr.maxItems) {
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
    const handling = idxs.length * 2 * input.settings.handlingMinutes
    const t2 = routeTime(best / 10, handling, true, input.settings)
    return t2.limitedHours <= input.settings.maxHoursPerDay + 1e-9 || input.settings.timeLimitMode === 'none'
      ? best
      : Infinity
  }

  let bestServed = -1
  let bestCost = Infinity
  for (let code = 0; code < (T + 1) ** n; code++) {
    const groups: number[][] = Array.from({ length: T }, () => [])
    let c = code
    let served = 0
    for (let i = 0; i < n; i++, c = Math.floor(c / (T + 1))) {
      const g = c % (T + 1)
      if (g < T) {
        groups[g].push(i)
        served++
      }
    }
    if (served < bestServed) continue
    let cost = 0
    for (let t = 0; t < T && Number.isFinite(cost); t++) cost += bestRoute(t, groups[t])
    if (!Number.isFinite(cost)) continue
    if (served > bestServed || cost < bestCost) {
      bestServed = served
      bestCost = cost
    }
  }
  return [bestServed, bestCost]
}

describe('F4: more than two trucks', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('3 trucks, random instance #%i: exact = brute force', (seed) => {
    const input = randomInput(seed * 31, 4, 3, 3)
    const plan = solve(input)
    const [served, deci] = bruteForce(input)
    expect(plan.solverUsed).toBe('exact')
    expect(plan.ordersCompleted).toBe(served)
    expect(Math.round(plan.totalKm * 10)).toBe(deci)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('task data with a third truck: never worse than with two, and valid', () => {
    const input = cloneDefaultInput()
    input.trucks.push({ id: 'C', name: 'Kamion C', capacityKg: 5000, maxItems: 2 })
    const plan = solve(input)
    expect(plan.trucks).toHaveLength(3)
    expect(plan.ordersCompleted).toBe(10)
    expect(plan.totalKm).toBeLessThanOrEqual(200.1)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('12 orders and 4 trucks are solved exactly in reasonable time', () => {
    const input = randomInput(99, 12, 4, 9)
    const plan = solve(input)
    expect(plan.solverUsed).toBe('exact')
    expect(plan.solveMs).toBeLessThan(5000)
    expect(validatePlan(input, plan)).toEqual([])
  })
})

describe('F4: solver selection (decision D3)', () => {
  it('auto uses the exact solver for up to 12 orders', () => {
    expect(MAX_EXACT_ORDERS).toBe(12)
    expect(solve(cloneDefaultInput()).solverUsed).toBe('exact')
    expect(solve(randomInput(5, 12, 2, 9)).solverUsed).toBe('exact')
  })

  it('auto switches to the heuristic above 12 orders', () => {
    const input = randomInput(5, 13, 3, 9)
    const plan = solve(input)
    expect(plan.solverUsed).toBe('heuristic')
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('"Egzaktni" with more than 12 orders is refused with a clear message', () => {
    const input = withSolver(randomInput(5, 13, 3, 9), 'exact')
    expect(() => solve(input)).toThrow(InputError)
    try {
      solve(input)
    } catch (e) {
      expect((e as InputError).problems.join(' ')).toContain('Automatski')
    }
  })

  it('"Heuristika" can be forced on small data', () => {
    expect(solve(withSolver(cloneDefaultInput(), 'heuristic')).solverUsed).toBe('heuristic')
  })
})

describe('F4: heuristic quality', () => {
  it('finds the optimum on the task data: 200.1 km, and 217.0 km with the break', () => {
    const input = withSolver(cloneDefaultInput(), 'heuristic')
    const plan = solve(input)
    expect(plan.totalKm).toBe(200.1)
    expect(validatePlan(input, plan)).toEqual([])
    input.settings.breakEnabled = true
    expect(solve(input).totalKm).toBe(217)
  })

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))(
    'random instance #%i (7 orders): as many orders as exact, km within 10 %, always valid',
    (seed) => {
      const input = randomInput(seed, 7, 2 + (seed % 2), 4)
      const exact = solve(input)
      const heur = solve(withSolver(input, 'heuristic'))
      expect(validatePlan(input, heur)).toEqual([])
      expect(heur.ordersCompleted).toBe(exact.ordersCompleted)
      expect(heur.totalKm).toBeLessThanOrEqual(exact.totalKm * 1.1 + 1e-9)
    },
  )

  it('50 orders and 5 trucks: valid plan within a few seconds, nothing skipped silently', () => {
    const input = randomInput(99, 50, 5, 9)
    const plan = solve(input)
    expect(plan.solverUsed).toBe('heuristic')
    expect(plan.solveMs).toBeLessThan(5000)
    expect(validatePlan(input, plan)).toEqual([])
    expect(plan.ordersCompleted + plan.unassigned.length).toBe(50)
    for (const u of plan.unassigned) expect(u.reason.length).toBeGreaterThan(10)
  })
})
