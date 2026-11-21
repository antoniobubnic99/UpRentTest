import type { Order, Settings } from './types'

/** Loading at pickup + unloading at delivery for one order, in minutes. */
export function orderHandlingMinutes(order: Pick<Order, 'pickupMinutes' | 'deliveryMinutes'>, s: Settings): number {
  return (order.pickupMinutes ?? s.handlingMinutes) + (order.deliveryMinutes ?? s.handlingMinutes)
}

export interface RouteTime {
  driveHours: number
  handlingHours: number
  breakHours: number
  totalHours: number
  /** Hours counted against the daily limit under the selected mode. */
  limitedHours: number
}

/**
 * Working time of one route driven at the average speed (km / speedKmh).
 * - 'drive+handling': drive + loading/unloading + break (if enabled and the truck has orders)
 * - 'drive': drive only (the break is not counted)
 * - 'none': nothing is limited
 */
export function routeTime(km: number, handlingMinutes: number, hasOrders: boolean, s: Settings): RouteTime {
  return routeTimeFromDrive(km / s.speedKmh, handlingMinutes, hasOrders, s)
}

/** Same as routeTime, for a known driving time (e.g. the sum of per-relation leg times). */
export function routeTimeFromDrive(driveHours: number, handlingMinutes: number, hasOrders: boolean, s: Settings): RouteTime {
  const handlingHours = handlingMinutes / 60
  const breakHours = s.breakEnabled && hasOrders ? s.breakMinutes / 60 : 0
  const totalHours = driveHours + handlingHours + breakHours
  const limitedHours =
    s.timeLimitMode === 'drive+handling' ? totalHours : s.timeLimitMode === 'drive' ? driveHours : 0
  return { driveHours, handlingHours, breakHours, totalHours, limitedHours }
}

export function withinLimit(t: RouteTime, s: Settings): boolean {
  return s.timeLimitMode === 'none' || t.limitedHours <= s.maxHoursPerDay + 1e-9
}
