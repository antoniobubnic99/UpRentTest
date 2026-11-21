import { describe, expect, it } from 'vitest'
import { solve } from '../solver/solver'
import type { ProblemInput } from '../solver/types'
import { checkInput } from '../solver/validateInput'
import { validatePlan } from '../solver/validatePlan'
import { cloneDefaultInput, emptyInput, geoExampleInput } from './defaultData'
import { parseCoordinates, toResult } from './geocode'
import { MAX_WAYPOINTS, googleMapsRouteUrls } from './googleMaps'
import {
  ImportError,
  exportJson,
  exportLocationsCsv,
  exportTrucksCsv,
  importLocationsCsv,
  importOrdersCsv,
  importTrucksCsv,
  templateCsv,
} from './io'
import { arrowPoints, clearRoutingCache, fetchRoadMatrix, fetchRouteGeometry } from './routing'

/** Small geo instance: base + 2 locations, one order. */
function tiny(): ProblemInput {
  return {
    ...emptyInput('geo'),
    baseId: 'B',
    trucks: [{ id: 'A', name: 'A', capacityKg: 5000, maxItems: 2 }],
    machines: [{ id: 'M1', weightKg: 1000 }],
    locations: [
      { id: 'B', name: 'Baza', lat: 45.8131, lon: 15.9775 },
      { id: 'P', name: 'P', lat: 45.7125, lon: 16.0758 },
      { id: 'D', name: 'D', lat: 45.8011, lon: 15.711 },
    ],
    orders: [{ id: 'N1', machineId: 'M1', pickupId: 'P', deliveryId: 'D' }],
  }
}

describe('road distances (OSRM)', () => {
  it('the solver and validator use the road matrix: B->P 20.1, P->D 34.2, D->B 26.5 = 80.8 km', () => {
    const input: ProblemInput = {
      ...tiny(),
      roadMatrix: {
        ids: ['B', 'P', 'D'],
        km: [
          [0, 20.137, 25.479],
          [19.966, 0, 34.201],
          [26.525, 34.507, 0],
        ],
      },
    }
    const plan = solve(input)
    expect(plan.distanceUsed).toBe('road')
    expect(plan.totalKm).toBe(80.8)
    expect(validatePlan(input, plan)).toEqual([])
  })

  it('without a matrix (service down) it falls back to air distance x factor and says so', () => {
    const plan = solve(tiny())
    expect(plan.distanceUsed).toBe('air')
    const air = solve({ ...tiny(), settings: { ...tiny().settings, distanceSource: 'air' } })
    expect(plan.totalKm).toBe(air.totalKm)
  })

  it('"Zračna × faktor" ignores a matrix; the task grid never uses it', () => {
    const input = { ...tiny(), roadMatrix: { ids: ['B', 'P', 'D'], km: [[0, 1, 1], [1, 0, 1], [1, 1, 0]] } }
    expect(solve({ ...input, settings: { ...input.settings, distanceSource: 'air' } }).distanceUsed).toBe('air')
    expect(solve(cloneDefaultInput()).distanceUsed).toBe('xy')
  })

  it('a matrix missing a location or with an unreachable pair is reported', () => {
    const input = { ...tiny(), roadMatrix: { ids: ['B', 'P'], km: [[0, 1], [1, 0]] } }
    expect(checkInput(input).join(' ')).toContain('nisu učitane za lokacije: D')
    const unreachable = { ...tiny(), roadMatrix: { ids: ['B', 'P', 'D'], km: [[0, NaN, 1], [1, 0, 1], [1, 1, 0]] } }
    expect(checkInput(unreachable).join(' ')).toContain('nije našao cestovni put')
  })

  it('fetchRoadMatrix calls the OSRM table service (lon,lat order), converts m -> km and caches', async () => {
    clearRoutingCache()
    const urls: string[] = []
    const fake = async (url: string) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => ({ code: 'Ok', distances: [[0, 20137.3], [19965.6, 0]] }) }
    }
    const locs = tiny().locations.slice(0, 2)
    const m = await fetchRoadMatrix(locs, fake)
    expect(urls[0]).toBe(
      'https://router.project-osrm.org/table/v1/driving/15.977500,45.813100;16.075800,45.712500?annotations=distance,duration',
    )
    expect(m).toEqual({ ids: ['B', 'P'], km: [[0, 20.1373], [19.9656, 0]] })
    await fetchRoadMatrix(locs, fake)
    expect(urls).toHaveLength(1)
  })

  it('service errors become readable messages', async () => {
    clearRoutingCache()
    const down = async () => ({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchRoadMatrix(tiny().locations, down)).rejects.toThrow('503')
    const noRoute = async () => ({ ok: true, status: 200, json: async () => ({ code: 'NoRoute' }) })
    await expect(fetchRouteGeometry([[45, 15], [46, 16]], noRoute)).rejects.toThrow('NoRoute')
  })

  it('route geometry is converted to [lat, lon] and repeated stops are dropped', async () => {
    clearRoutingCache()
    let url = ''
    const fake = async (u: string) => {
      url = u
      return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[15.9, 45.8], [16, 45.7]] } }] }) }
    }
    const line = await fetchRouteGeometry([[45.8, 15.9], [45.8, 15.9], [45.7, 16]], fake)
    expect(line).toEqual([[45.8, 15.9], [45.7, 16]])
    expect(url).toContain('/route/v1/driving/15.900000,45.800000;16.000000,45.700000?overview=full&geometries=geojson')
  })

  it('arrows are spread along the road line', () => {
    const line: [number, number][] = [[45.8, 15.9], [45.8, 16.2]] // about 23 km east
    const arrows = arrowPoints(line, 6)
    expect(arrows.length).toBe(4)
    for (const a of arrows) expect(a.at[0]).toBeCloseTo(45.8, 6)
    expect(arrowPoints([[45, 15], [45, 15]], 5)).toEqual([])
  })

  it('road matrix is never exported or shared', () => {
    const json = exportJson({ ...tiny(), roadMatrix: { ids: ['B'], km: [[0]] } })
    expect(json).not.toContain('roadMatrix')
  })
})

describe('address search details', () => {
  it('accepts typed coordinates and Google Maps links', () => {
    expect(parseCoordinates('45.81310, 15.97750')).toEqual({ lat: 45.8131, lon: 15.9775 })
    expect(parseCoordinates('45,8131 15,9775')).toEqual({ lat: 45.8131, lon: 15.9775 })
    expect(parseCoordinates('https://www.google.com/maps/place/X/@45.8131,15.9775,17z/data=!3m1')).toEqual({ lat: 45.8131, lon: 15.9775 })
    expect(parseCoordinates('https://maps.google.com/?q=45.8131,15.9775')).toEqual({ lat: 45.8131, lon: 15.9775 })
    expect(parseCoordinates('...!3d45.8131!4d15.9775')).toEqual({ lat: 45.8131, lon: 15.9775 })
    expect(parseCoordinates('Horvatova ulica 13')).toBeNull()
    expect(parseCoordinates('95.1, 15.2')).toBeNull()
  })

  it('labels a hit with house number, district and town', () => {
    const r = toResult(
      {
        display_name: '10, Ilica, Gornji grad, Zagreb, 10000, Hrvatska',
        lat: '45.8131',
        lon: '15.9737',
        address: { house_number: '10', road: 'Ilica', city_district: 'Gornji grad - Medveščak', city: 'Grad Zagreb', postcode: '10000' },
      },
      'Ilica 10, Zagreb',
    )
    expect(r.name).toBe('Ilica 10')
    expect(r.detail).toBe('Gornji grad - Medveščak, Grad Zagreb, 10000')
    expect(r.houseNumberMissing).toBe(false)
  })

  it('flags a street hit when the house number is not in OpenStreetMap', () => {
    const r = toResult(
      {
        display_name: 'Horvatova ulica, Sesvete, Zagreb',
        lat: '45.83',
        lon: '16.11',
        address: { road: 'Horvatova ulica', city_district: 'Gradska četvrt Sesvete', city: 'Grad Zagreb', postcode: '10174' },
      },
      'Horvatova ulica 13 Sesvete',
    )
    expect(r.name).toBe('Horvatova ulica')
    expect(r.houseNumberMissing).toBe(true)
    // a postcode alone is not a house number
    expect(toResult({ display_name: 'Ilica', lat: '1', lon: '1', address: { road: 'Ilica' } }, 'Ilica 10000').houseNumberMissing).toBe(false)
  })
})

describe('Google Maps links', () => {
  it('one link for a short route, origin/destination/waypoints in order', () => {
    const urls = googleMapsRouteUrls([
      { lat: 45.8, lon: 15.9 },
      { lat: 45.7, lon: 16 },
      { lat: 45.7, lon: 16 },
      { lat: 45.8, lon: 15.9 },
    ])
    expect(urls).toHaveLength(1)
    const u = new URL(urls[0])
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(u.searchParams.get('api')).toBe('1')
    expect(u.searchParams.get('origin')).toBe('45.800000,15.900000')
    expect(u.searchParams.get('waypoints')).toBe('45.700000,16.000000')
    expect(u.searchParams.get('destination')).toBe('45.800000,15.900000')
    expect(u.searchParams.get('travelmode')).toBe('driving')
  })

  it('long routes are split into parts of at most 9 waypoints that continue each other', () => {
    const stops = Array.from({ length: 21 }, (_, i) => ({ lat: 45 + i / 100, lon: 16 }))
    const urls = googleMapsRouteUrls(stops).map((s) => new URL(s).searchParams)
    expect(urls).toHaveLength(2)
    for (const p of urls) expect((p.get('waypoints') ?? '').split('|').length).toBeLessThanOrEqual(MAX_WAYPOINTS)
    expect(urls[1].get('origin')).toBe(urls[0].get('destination'))
    expect(urls[1].get('destination')).toBe('45.200000,16.000000')
  })
})

describe('CSV vehicles, locations and templates', () => {
  it('templates have the documented headers and import cleanly in order', () => {
    let input = emptyInput()
    input = importTrucksCsv(input, templateCsv('trucks'))
    const loc = importLocationsCsv(input, templateCsv('locations'))
    expect(loc.input.coordinateMode).toBe('geo')
    expect(loc.input.baseId).toBe('L0')
    expect(loc.toGeocode).toEqual(['L0', 'L1'])
    input = importOrdersCsv(loc.input, templateCsv('orders'))
    expect(input.trucks).toHaveLength(2)
    expect(input.orders.map((o) => o.id)).toEqual(['N01', 'N02'])
    expect(input.orders[1].pickupMinutes).toBe(45)
  })

  it('vehicles: round trip and errors with row numbers', () => {
    const input = cloneDefaultInput()
    expect(importTrucksCsv(emptyInput(), exportTrucksCsv(input)).trucks).toEqual(input.trucks)
    try {
      importTrucksCsv(input, 'id;naziv;nosivost_kg;max_strojeva\nA;;0;2\nA;X;5000;1,5\n')
      expect.unreachable()
    } catch (e) {
      expect((e as ImportError).problems).toEqual([
        'Red 2: nosivost mora biti broj veći od 0.',
        'Red 3: max_strojeva mora biti cijeli broj ≥ 1.',
        'Oznake vozila se ponavljaju: A.',
      ])
    }
  })

  it('locations: task grid round trip keeps 200.1 km', () => {
    const input = cloneDefaultInput()
    const { input: back, toGeocode } = importLocationsCsv(input, exportLocationsCsv(input))
    expect(toGeocode).toEqual([])
    expect(back.coordinateMode).toBe('xy')
    expect(back.locations).toEqual(input.locations)
    expect(solve(back).totalKm).toBe(200.1)
  })

  it('locations: geo round trip with addresses and base', () => {
    const input = geoExampleInput()
    input.locations[2].address = 'Sesvete'
    const { input: back } = importLocationsCsv(input, exportLocationsCsv(input))
    expect(back.locations).toEqual(input.locations)
    expect(back.baseId).toBe('L0')
  })

  it('locations: orders must keep valid references, one base only, coordinates or address required', () => {
    const input = cloneDefaultInput()
    const csv = 'id;naziv;x_km;y_km;baza\nL0;Baza;0;0;da\nL1;A;3;8;da\n'
    const problems = (() => {
      try {
        importLocationsCsv(input, csv)
        return []
      } catch (e) {
        return (e as ImportError).problems
      }
    })()
    expect(problems[0]).toBe('Red 3: baza je već L0; označi samo jednu bazu.')
    expect(problems.join(' ')).toContain('koriste lokacije kojih nema u CSV-u')
    expect(() => importLocationsCsv(emptyInput(), 'id;naziv\nL0;Baza\n')).toThrow('upiši koordinate')
  })
})
