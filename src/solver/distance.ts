import type { CoordinateMode, Location } from './types'

export interface DistanceOptions {
  coordinateMode: CoordinateMode
  /** Multiplier applied to great-circle distance in 'geo' mode. */
  roadFactor: number
}

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

/** Distance options for a problem instance. */
export function distanceOptions(input: { coordinateMode: CoordinateMode; settings: { roadFactor: number } }): DistanceOptions {
  return { coordinateMode: input.coordinateMode, roadFactor: input.settings.roadFactor }
}
