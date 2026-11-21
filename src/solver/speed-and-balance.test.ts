import { describe, expect, it } from 'vitest'
import { cloneDefaultInput, emptyInput } from '../data/defaultData'
import { fetchRoadMatrix, clearRoutingCache } from '../data/routing'
import { solve } from './solver'
import type { ProblemInput } from './types'
import { validatePlan } from './validatePlan'

const minutesOf = (h: number) => Math.round(h * 60)

describe('even workload ("Ravnomjerna raspodjela")', () => {
  const balanced = (pct: number, patch: Partial<ProblemInput['settings']> = {}) => {
    const input = cloneDefaultInput()
    input.settings = { ...input.settings, objective: 'balanced', balanceMaxExtraPct: pct, ...patch }
    return input
  }

  it('task data, up to +10 % km: A drives N01 + N04, 217,0 km, A 122 min, B 495 min', () => {
    const input = balanced(10)
    const plan = solve(input)
    expect(plan.totalKm).toBe(217)
    expect(plan.trucks[0].orderIds).toEqual(['N01', 'N04'])
    expect(minutesOf(plan.trucks[0].totalHours)).toBe(122)
    expect(minutesOf(plan.trucks[1].totalHours)).toBe(495)
    expect(plan.ordersCompleted).toBe(10)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('0 % extra km keeps the minimum-km plan (200,1 km); the default objective is km', () => {
    expect(solve(balanced(0)).totalKm).toBe(200.1)
    expect(solve(cloneDefaultInput()).totalKm).toBe(200.1)
  })

  it('without a km bound the longest day is as short as possible: 284,2 km, 339 / 345 min', () => {
    const plan = solve(balanced(100))
    expect(plan.totalKm).toBe(284.2)
    expect(plan.trucks.map((t) => minutesOf(t.totalHours))).toEqual([339, 345])
  })

  it('never serves fewer orders than the km objective (tight 6 h limit)', () => {
    const km = solve({ ...cloneDefaultInput(), settings: { ...cloneDefaultInput().settings, maxHoursPerDay: 6 } })
    const even = solve(balanced(100, { maxHoursPerDay: 6 }))
    expect(even.ordersCompleted).toBe(km.ordersCompleted)
  })

  it('exact balanced result equals brute force over all assignments (random instances)', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let k = 0; k < 8; k++) {
      const n = 5
      const input: ProblemInput = {
        ...emptyInput('xy'),
        baseId: 'L0',
        trucks: [
          { id: 'A', name: 'A', capacityKg: 4000, maxItems: 2 },
          { id: 'B', name: 'B', capacityKg: 9000, maxItems: 3 },
        ],
        locations: Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, name: `L${i}`, x: Math.round(rnd() * 30), y: Math.round(rnd() * 30) })),
        machines: Array.from({ length: n }, (_, i) => ({ id: `M${i}`, weightKg: 500 + Math.round(rnd() * 5000) })),
        orders: Array.from({ length: n }, (_, i) => {
          const a = 1 + Math.floor(rnd() * 5)
          const b = ((a + Math.floor(rnd() * 4)) % 5) + 1
          return { id: `N${i}`, machineId: `M${i}`, pickupId: `L${a}`, deliveryId: `L${b === a ? (a % 5) + 1 : b}` }
        }),
      }
      input.settings = { ...input.settings, objective: 'balanced', balanceMaxExtraPct: 15, maxHoursPerDay: 4 }
      const plan = solve(input)
      expect(validatePlan(input, plan)).toEqual([])

      // Brute force: each truck's route for a subset from a single-truck km solve.
      const single = new Map<string, { km: number; hours: number } | null>()
      const route = (t: number, mask: number) => {
        const key = `${t}:${mask}`
        if (mask === 0) return { km: 0, hours: 0 }
        if (!single.has(key)) {
          const orders = input.orders.filter((_, i) => mask & (1 << i))
          const sub = solve({ ...input, trucks: [input.trucks[t]], orders, settings: { ...input.settings, objective: 'km' } })
          single.set(key, sub.ordersCompleted === orders.length ? { km: sub.totalKm, hours: sub.trucks[0].totalHours } : null)
        }
        return single.get(key)!
      }
      const options: { served: number; km: number; longest: number }[] = []
      for (let code = 0; code < 3 ** n; code++) {
        let ma = 0
        let mb = 0
        for (let i = 0, c = code; i < n; i++, c = Math.floor(c / 3)) {
          if (c % 3 === 1) ma |= 1 << i
          if (c % 3 === 2) mb |= 1 << i
        }
        const ra = route(0, ma)
        const rb = route(1, mb)
        if (!ra || !rb) continue
        const served = input.orders.filter((_, i) => (ma | mb) & (1 << i)).length
        options.push({ served, km: Math.round((ra.km + rb.km) * 10) / 10, longest: Math.max(ra.hours, rb.hours) })
      }
      const maxServed = Math.max(...options.map((o) => o.served))
      const top = options.filter((o) => o.served === maxServed)
      const minKm = Math.min(...top.map((o) => o.km))
      const allowed = top.filter((o) => o.km <= minKm * 1.15 + 1e-6)
      const bestLongest = Math.min(...allowed.map((o) => o.longest))
      const bestKm = Math.min(...allowed.filter((o) => o.longest <= bestLongest + 1e-9).map((o) => o.km))
      expect(plan.ordersCompleted).toBe(maxServed)
      expect(Math.max(...plan.trucks.map((t) => t.totalHours))).toBeCloseTo(bestLongest, 9)
      expect(plan.totalKm).toBe(bestKm)
    }
  })

  it('heuristic: stays within the km bound, evens out the days and is valid', () => {
    const input = balanced(10, { solverMode: 'heuristic' })
    const plan = solve(input)
    expect(plan.solverUsed).toBe('heuristic')
    expect(plan.totalKm).toBeLessThanOrEqual(200.1 * 1.1 + 1e-9)
    expect(Math.max(...plan.trucks.map((t) => minutesOf(t.totalHours)))).toBeLessThan(523)
    expect(validatePlan(input, plan)).toEqual([])
  })
})

/** Real-map instance with a hand-made road matrix (km + minutes). */
function roadInput(km: number[][], minutes: number[][], patch: Partial<ProblemInput['settings']> = {}): ProblemInput {
  const base = emptyInput('geo')
  return {
    ...base,
    baseId: 'B',
    trucks: [{ id: 'T', name: 'T', capacityKg: 5000, maxItems: 1 }],
    machines: [
      { id: 'M1', weightKg: 1000 },
      { id: 'M2', weightKg: 1000 },
    ],
    locations: [
      { id: 'B', name: 'Baza', lat: 45.8, lon: 15.97 },
      { id: 'X', name: 'X', lat: 45.7, lon: 15.9 },
      { id: 'Y', name: 'Y', lat: 45.6, lon: 15.6 },
    ],
    orders: [
      { id: 'N1', machineId: 'M1', pickupId: 'X', deliveryId: 'Y' },
      { id: 'N2', machineId: 'M2', pickupId: 'Y', deliveryId: 'X' },
    ],
    roadMatrix: { ids: ['B', 'X', 'Y'], km, minutes },
    settings: { ...base.settings, distanceSource: 'road', handlingMinutes: 0, ...patch },
  }
}

describe('speed per relation (road travel times)', () => {
  // Hand-made matrix: 56 km in 40 min is 84 km/h for a car, a truck is capped at 80 km/h -> 42 min.
  // (Real OSRM, 21.11.2026: Zagreb centre -> Karlovac centre 55,1 km in 48 min = 69 km/h, under the cap.)
  const km = [
    [0, 56, 20],
    [56, 0, 30],
    [20, 30, 0],
  ]
  const minutes = [
    [0, 40, 30],
    [40, 0, 45],
    [30, 45, 0],
  ]

  it('drive time per leg comes from the road service, capped by the truck speed', () => {
    const input = roadInput(km, minutes)
    input.orders = [input.orders[0]]
    const plan = solve(input)
    expect(plan.timeUsed).toBe('road')
    const [, toX, toY, back] = plan.trucks[0].steps
    expect(minutesOf(toX.legHours)).toBe(42) // 56 km / 80 km/h, faster than the car time is not allowed
    expect(minutesOf(toY.legHours)).toBe(45) // 30 km in 45 min (40 km/h, town roads)
    expect(minutesOf(back.legHours)).toBe(30)
    expect(minutesOf(plan.trucks[0].driveHours)).toBe(117)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('a higher truck limit uses the road time as is; "average speed" ignores it', () => {
    const fast = roadInput(km, minutes, { truckMaxSpeedKmh: 120 })
    fast.orders = [fast.orders[0]]
    expect(minutesOf(solve(fast).trucks[0].steps[1].legHours)).toBe(40)

    const avg = roadInput(km, minutes, { travelTimeSource: 'speed' })
    avg.orders = [avg.orders[0]]
    const plan = solve(avg)
    expect(plan.timeUsed).toBe('speed')
    expect(minutesOf(plan.trucks[0].driveHours)).toBe(106) // 106 km at 60 km/h
    expect(validatePlan(avg, plan)).toEqual([])
  })

  it('task data (coordinate system) still uses the average speed: 200,1 km', () => {
    const plan = solve(cloneDefaultInput())
    expect(plan.timeUsed).toBe('speed')
    expect(plan.totalKm).toBe(200.1)
    expect(plan.timeFallbacks).toBe(0)
  })

  it('when the shortest route breaks the limit, a faster (longer) route that fits is used and flagged', () => {
    // B-X is short but slow (10 km/h), B-Y longer but fast; one machine on board at a time.
    // Shortest: B X Y X B = 30 km, 130 min. Fastest: B Y X Y B = 32 km, 26 min.
    const k = [
      [0, 10, 11],
      [10, 0, 5],
      [11, 5, 0],
    ]
    const m = [
      [0, 60, 8],
      [60, 0, 5],
      [8, 5, 0],
    ]
    const input = roadInput(k, m, { truckMaxSpeedKmh: 200, maxHoursPerDay: 1 })
    const plan = solve(input)
    expect(plan.ordersCompleted).toBe(2)
    expect(plan.totalKm).toBe(32)
    expect(minutesOf(plan.trucks[0].driveHours)).toBe(26)
    expect(plan.timeFallbacks).toBeGreaterThan(0)
    expect(validatePlan(input, plan)).toEqual([])

    // Without a time limit the shortest route is used and nothing is flagged.
    const free = solve(roadInput(k, m, { truckMaxSpeedKmh: 200, timeLimitMode: 'none' }))
    expect(free.totalKm).toBe(30)
    expect(free.timeFallbacks).toBe(0)
  })

  it('heuristic respects per-relation times as well', () => {
    const k = [
      [0, 10, 11],
      [10, 0, 5],
      [11, 5, 0],
    ]
    const m = [
      [0, 60, 8],
      [60, 0, 5],
      [8, 5, 0],
    ]
    // (with a 1 h limit neither order fits alone, only both together: insertion one by one
    // cannot find that, which is a known limit of the heuristic; 1,5 h lets it build up)
    const input = roadInput(k, m, { truckMaxSpeedKmh: 200, maxHoursPerDay: 1.5, solverMode: 'heuristic' })
    const plan = solve(input)
    expect(plan.ordersCompleted).toBe(2)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('OSRM table: asks for distance and duration, converts seconds to minutes (Zagreb - Karlovac)', async () => {
    clearRoutingCache()
    let url = ''
    const matrix = await fetchRoadMatrix(
      [
        { id: 'Z', name: 'Zagreb', lat: 45.8131, lon: 15.9775 },
        { id: 'K', name: 'Karlovac', lat: 45.4929, lon: 15.5553 },
      ],
      async (u) => {
        url = u
        return {
          ok: true,
          status: 200,
                    // values returned by router.project-osrm.org on 21.11.2026
          json: async () => ({ code: 'Ok', distances: [[0, 55120.3], [55042.2, 0]], durations: [[0, 2876.4], [2909.6, 0]] }),
        }
      },
    )
    expect(url).toContain('annotations=distance,duration')
    expect(matrix.km[0][1]).toBeCloseTo(55.12, 2)
    expect(matrix.minutes![0][1]).toBeCloseTo(47.94, 2)
    // one leg Zagreb -> Karlovac: 55,1 km in 48 min = 69 km/h (below the 80 km/h truck cap)
    const input = roadInput(
      [
        [0, 55.12, 1],
        [55.04, 0, 1],
        [1, 1, 0],
      ],
      [
        [0, 47.94, 1],
        [48.49, 0, 1],
        [1, 1, 0],
      ],
    )
    input.orders = [{ id: 'N1', machineId: 'M1', pickupId: 'X', deliveryId: 'Y' }]
    const plan = solve(input)
    const leg = plan.trucks[0].steps[1]
    expect(leg.legKm).toBe(55.1)
    expect(minutesOf(leg.legHours)).toBe(48)
    expect(Math.round(leg.legKm / leg.legHours)).toBe(69)
    expect(validatePlan(input, plan)).toEqual([])
  })
})

describe('suggestion "Kamion A je slabo iskorišten"', () => {
  it('task data: suggests A drives N01 + N04, 217,0 km (+16,9 km), A 122 min, B 495 min', async () => {
    const { balanceSuggestion } = await import('./scenarios')
    const input = cloneDefaultInput()
    const s = balanceSuggestion(input, solve(input))!
    expect(s.idle).toEqual({ name: 'Kamion A', hours: expect.any(Number) })
    expect(minutesOf(s.idle.hours)).toBe(77)
    expect(s.plan.totalKm).toBe(217)
    expect(s.deltaKm).toBe(16.9)
    expect(s.moves).toEqual([
      { truck: 'Kamion A', orderIds: ['N01', 'N04'] },
      { truck: 'Kamion B', orderIds: ['N03'] },
    ])
    expect(s.plan.trucks.map((t) => minutesOf(t.totalHours))).toEqual([122, 495])
    expect(s.settings.objective).toBe('balanced')
  })

  it('no suggestion when the objective is already balanced or the trucks are evenly used', async () => {
    const { balanceSuggestion } = await import('./scenarios')
    const input = cloneDefaultInput()
    input.settings.objective = 'balanced'
    expect(balanceSuggestion(input, solve(input))).toBeNull()
    const even = cloneDefaultInput()
    even.settings.objective = 'km'
    even.settings.balanceMaxExtraPct = 100
    even.settings.timeLimitMode = 'drive+handling'
    const balancedPlan = solve({ ...even, settings: { ...even.settings, objective: 'balanced' } })
    expect(balanceSuggestion(even, balancedPlan)).toBeNull()
  })
})
