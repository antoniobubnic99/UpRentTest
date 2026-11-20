import type { Location } from './types'

/**
 * Euclidean distance between two locations, rounded to one decimal,
 * returned as an integer number of tenths of a kilometre ("deci-km").
 *
 * Working in integer deci-km keeps every sum exact, so totals are
 * always the sum of rounded legs, as the task requires.
 */
export function legDeciKm(a: Location, b: Location): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10)
}

/** Euclidean distance rounded to one decimal, in km. */
export function legKm(a: Location, b: Location): number {
  return legDeciKm(a, b) / 10
}

export function deciToKm(deci: number): number {
  return Math.round(deci) / 10
}
