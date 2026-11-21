import type { CoordinateMode, Location, ProblemInput, Settings } from './types'

export interface DistanceOptions {
  coordinateMode: CoordinateMode
  /** Multiplier applied to great-circle distance in 'geo' mode. */
  roadFactor: number
  /** Road distances (km) by location id; used instead of the formula when present. */
  matrix?: Map<string, Map<string, number>>
  /** Road travel times (minutes) by location id; present only when per-relation times are used. */
  minutes?: Map<string, Map<string, number>>
  /** Upper bound on the average speed of one relation (km/h), used with `minutes`. */
  truckMaxSpeedKmh?: number
  /** Average speed (km/h) when per-relation times are not used. */
  speedKmh?: number
}

/** Default upper bound on a truck's average speed on one relation (km/h). */
export const DEFAULT_TRUCK_MAX_SPEED = 80

/** The task data: abstract grid in km, plain Euclidean distance. */
export const XY_DISTANCE: DistanceOptions = { coordinateMode: 'xy', roadFactor: 1 }

/** Mean Earth radius (IUGG), km. */
export const EARTH_RADIUS_KM = 6371.0088

/** Great-circle distance between two lat/lon points in km (haversine formula). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Unrounded distance in km under the given mode. */
export function rawKm(a: Location, b: Location, opts: DistanceOptions = XY_DISTANCE): number {
  if (opts.coordinateMode === 'geo') {
    const road = opts.matrix?.get(a.id)?.get(b.id)
    if (road !== undefined) return road
    return haversineKm(a.lat ?? NaN, a.lon ?? NaN, b.lat ?? NaN, b.lon ?? NaN) * opts.roadFactor
  }
  return Math.hypot((a.x ?? NaN) - (b.x ?? NaN), (a.y ?? NaN) - (b.y ?? NaN))
}

/**
 * Leg distance rounded to one decimal, returned as an integer number of tenths
 * of a kilometre ("deci-km").
 *
 * Working in integer deci-km keeps every sum exact, so totals are always the sum
 * of rounded legs, as the task requires. Applies to both 'xy' and 'geo' modes.
 */
export function legDeciKm(a: Location, b: Location, opts: DistanceOptions = XY_DISTANCE): number {
  return Math.round(rawKm(a, b, opts) * 10)
}

/** Leg distance rounded to one decimal, in km. */
export function legKm(a: Location, b: Location, opts: DistanceOptions = XY_DISTANCE): number {
  return legDeciKm(a, b, opts) / 10
}

export function deciToKm(deci: number): number {
  return Math.round(deci) / 10
}

/** True when the instance should (and can) use road distances. */
export function usesRoadMatrix(input: Pick<ProblemInput, 'coordinateMode' | 'roadMatrix'> & { settings: { distanceSource?: string } }): boolean {
  return input.coordinateMode === 'geo' && input.settings.distanceSource === 'road' && !!input.roadMatrix
}

type TimeInput = Pick<ProblemInput, 'coordinateMode' | 'roadMatrix'> & {
  settings: Pick<Settings, 'roadFactor'> & Partial<Pick<Settings, 'distanceSource' | 'travelTimeSource' | 'truckMaxSpeedKmh' | 'speedKmh'>>
}

/**
 * True when driving time is taken per relation from the road service (travel time of each
 * leg) instead of distance / average speed. Needs real-map mode with road distances and
 * a matrix that carries travel times.
 */
export function usesLegTimes(input: TimeInput): boolean {
  return (
    usesRoadMatrix(input) &&
    (input.settings.travelTimeSource ?? 'road') === 'road' &&
    Array.isArray(input.roadMatrix!.minutes)
  )
}

const toMap = (ids: string[], m: number[][]) =>
  new Map(ids.map((a, i) => [a, new Map(ids.map((b, j) => [b, m[i][j]]))]))

/** Distance options for a problem instance. */
export function distanceOptions(input: TimeInput): DistanceOptions {
  const opts: DistanceOptions = {
    coordinateMode: input.coordinateMode,
    roadFactor: input.settings.roadFactor,
    speedKmh: input.settings.speedKmh,
  }
  if (usesRoadMatrix(input)) {
    const { ids, km, minutes } = input.roadMatrix!
    opts.matrix = toMap(ids, km)
    if (usesLegTimes(input)) {
      opts.minutes = toMap(ids, minutes!)
      opts.truckMaxSpeedKmh = input.settings.truckMaxSpeedKmh ?? DEFAULT_TRUCK_MAX_SPEED
    }
  }
  return opts
}

/**
 * Driving time of one leg in whole seconds.
 * - per relation: road travel time, but not faster than the truck's maximum average speed
 *   (the routing service uses a car profile; a truck is limited to 80 km/h on motorways)
 * - otherwise: rounded leg distance / average speed
 * Whole seconds keep solver, plan and validator on exactly the same numbers.
 */
export function legSeconds(a: Location, b: Location, legKmRounded: number, opts: DistanceOptions): number {
  if (a.id === b.id) return 0
  const road = opts.minutes?.get(a.id)?.get(b.id)
  if (road !== undefined) {
    const vmax = opts.truckMaxSpeedKmh ?? DEFAULT_TRUCK_MAX_SPEED
    return Math.round(Math.max(road * 60, (legKmRounded / vmax) * 3600))
  }
  return Math.round((legKmRounded / (opts.speedKmh ?? 60)) * 3600)
}

/** Average speed of a leg (km/h), or undefined for a zero-length or zero-time leg. */
export function legSpeedKmh(km: number, hours: number): number | undefined {
  return km > 0 && hours > 0 ? km / hours : undefined
}
