import { describe, expect, it } from 'vitest'
import { cloneDefaultInput, defaultSettings, emptyInput, isEmptyInput } from '../data/defaultData'
import { haversineKm, legKm } from './distance'
import { solve } from './solver'
import type { Location, ProblemInput } from './types'
import { checkInput, InputError } from './validateInput'
import { validatePlan } from './validatePlan'

const zagreb: Location = { id: 'ZG', name: 'Zagreb', lat: 45.815, lon: 15.9819 }
const split: Location = { id: 'ST', name: 'Split', lat: 43.5081, lon: 16.4402 }

describe('F0: default settings', () => {
  it('keep the task result unchanged: break off, automatic solver, road factor 1.3', () => {
    expect(defaultSettings).toMatchObject({
      speedKmh: 60,
      handlingMinutes: 20,
      maxHoursPerDay: 9,
      timeLimitMode: 'drive+handling',
      breakEnabled: false,
      breakMinutes: 30,
      solverMode: 'auto',
      roadFactor: 1.3,
    })
  })

  it('task data is in the xy coordinate mode and still gives 200.1 km', () => {
    const input = cloneDefaultInput()
    expect(input.coordinateMode).toBe('xy')
    const plan = solve(input)
    expect(plan.totalKm).toBe(200.1)
    expect(validatePlan(input, plan)).toEqual([])
  })
})

describe('F0: geo distance (haversine x road factor)', () => {
  it('one degree of longitude on the equator is about 111.195 km', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.195, 3)
  })

  it('Zagreb–Split great-circle distance is 259.1 km (rounded to 0.1)', () => {
    expect(legKm(zagreb, split, { coordinateMode: 'geo', roadFactor: 1 })).toBe(259.1)
  })

  it('applies the road factor before rounding: 259.06 x 1.3 = 336.8 km', () => {
    expect(legKm(zagreb, split, { coordinateMode: 'geo', roadFactor: 1.3 })).toBe(336.8)
  })

  it('is symmetric and zero for the same point', () => {
    const opts = { coordinateMode: 'geo' as const, roadFactor: 1.3 }
    expect(legKm(zagreb, split, opts)).toBe(legKm(split, zagreb, opts))
    expect(legKm(zagreb, zagreb, opts)).toBe(0)
  })

  it('solver and validator use geo distances in geo mode', () => {
    const input: ProblemInput = {
      ...emptyInput('geo'),
      baseId: 'ZG',
      trucks: [{ id: 'A', name: 'A', capacityKg: 5000, maxItems: 2 }],
      machines: [{ id: 'M1', weightKg: 1000 }],
      locations: [zagreb, split],
      // Zagreb -> Split is 336.8 km by road factor 1.3; 2 x 336.8 = 673.6 km
      orders: [{ id: 'N1', machineId: 'M1', pickupId: 'ZG', deliveryId: 'ST' }],
    }
    input.settings.timeLimitMode = 'none'
    const plan = solve(input)
    expect(plan.totalKm).toBe(673.6)
    expect(validatePlan(input, plan)).toEqual([])
  })
})

describe('F0: empty starting state', () => {
  it('starts with no trucks, locations or orders and default settings', () => {
    const input = emptyInput()
    expect(isEmptyInput(input)).toBe(true)
    expect(input.coordinateMode).toBe('xy')
    expect(input.settings).toEqual(defaultSettings)
    expect(isEmptyInput(cloneDefaultInput())).toBe(false)
  })

  it('empty input is rejected with clear messages instead of crashing', () => {
    const input = emptyInput()
    expect(checkInput(input)).toEqual([
      'Nema nijedne lokacije.',
      'Nema nijednog kamiona.',
      'Nema nijednog naloga.',
    ])
    expect(() => solve(input)).toThrow(InputError)
  })

  it('emptyInput returns independent copies of the settings', () => {
    const a = emptyInput()
    a.settings.breakEnabled = true
    expect(emptyInput().settings.breakEnabled).toBe(false)
    expect(defaultSettings.breakEnabled).toBe(false)
  })
})

describe('F0: input validation for the new fields', () => {
  it('rejects negative or non-numeric per-order handling minutes, accepts empty', () => {
    const input = cloneDefaultInput()
    input.orders[0].pickupMinutes = -5
    input.orders[1].deliveryMinutes = NaN
    input.orders[2].pickupMinutes = 45
    const problems = checkInput(input)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('N01')
    expect(problems[1]).toContain('N02')
  })

  it('geo mode requires valid latitude and longitude', () => {
    const input: ProblemInput = {
      ...emptyInput('geo'),
      baseId: 'ZG',
      trucks: [{ id: 'A', name: 'A', capacityKg: 5000, maxItems: 2 }],
      machines: [{ id: 'M1', weightKg: 1000 }],
      locations: [zagreb, { id: 'X', name: 'X', lat: 95, lon: 16 }, { id: 'Y', name: 'Y', x: 1, y: 2 }],
      orders: [{ id: 'N1', machineId: 'M1', pickupId: 'ZG', deliveryId: 'X' }],
    }
    const problems = checkInput(input)
    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toContain('Lokacija X')
    expect(problems.join(' ')).toContain('Lokacija Y')
  })

  it('geo mode requires road factor >= 1; xy mode ignores it', () => {
    const geo: ProblemInput = {
      ...emptyInput('geo'),
      baseId: 'ZG',
      trucks: [{ id: 'A', name: 'A', capacityKg: 5000, maxItems: 2 }],
      machines: [{ id: 'M1', weightKg: 1000 }],
      locations: [zagreb, split],
      orders: [{ id: 'N1', machineId: 'M1', pickupId: 'ZG', deliveryId: 'ST' }],
    }
    geo.settings.roadFactor = 0.8
    expect(checkInput(geo)).toHaveLength(1)
    const xy = cloneDefaultInput()
    xy.settings.roadFactor = 0.8
    expect(checkInput(xy)).toEqual([])
  })

  it('rejects a negative break only when the break is enabled', () => {
    const input = cloneDefaultInput()
    input.settings.breakMinutes = -10
    expect(checkInput(input)).toEqual([])
    input.settings.breakEnabled = true
    expect(checkInput(input)).toEqual(['Trajanje pauze ne smije biti negativno.'])
  })
})
