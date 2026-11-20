export interface Truck {
  id: string
  name: string
  capacityKg: number
  maxItems: number
}

export interface Machine {
  id: string
  weightKg: number
}

/**
 * How locations are positioned. A data set uses exactly one mode:
 * - 'xy': abstract coordinate system in km (the task data)
 * - 'geo': real map positions (latitude / longitude)
 */
export type CoordinateMode = 'xy' | 'geo'

export interface Location {
  id: string
  name: string
  /** km on the abstract grid ('xy' mode) */
  x?: number
  y?: number
  /** degrees ('geo' mode) */
  lat?: number
  lon?: number
  /** free-text address, informational only ('geo' mode) */
  address?: string
}

export interface Order {
  id: string
  machineId: string
  pickupId: string
  deliveryId: string
  /** Loading time at pickup; falls back to Settings.handlingMinutes when not set. */
  pickupMinutes?: number
  /** Unloading time at delivery; falls back to Settings.handlingMinutes when not set. */
  deliveryMinutes?: number
}

/**
 * How the 9h daily limit is interpreted:
 * - 'drive+handling': driving time + loading/unloading time (default)
 * - 'drive': driving time only
 * - 'none': no time limit
 */
export type TimeLimitMode = 'drive+handling' | 'drive' | 'none'

/**
 * Which solver to run:
 * - 'auto': exact for up to MAX_EXACT_ORDERS orders, heuristic above that (default)
 * - 'exact': always exact (refused above MAX_EXACT_ORDERS)
 * - 'heuristic': always heuristic
 */
export type SolverMode = 'auto' | 'exact' | 'heuristic'

export interface Settings {
  speedKmh: number
  /** Default loading / unloading time per action (minutes). */
  handlingMinutes: number
  maxHoursPerDay: number
  timeLimitMode: TimeLimitMode
  /** Mandatory lunch break for every truck that has at least one order. */
  breakEnabled: boolean
  breakMinutes: number
  solverMode: SolverMode
  /** 'geo' mode only: straight-line distance is multiplied by this factor to approximate roads. */
  roadFactor: number
}

export interface ProblemInput {
  coordinateMode: CoordinateMode
  baseId: string
  trucks: Truck[]
  machines: Machine[]
  locations: Location[]
  orders: Order[]
  settings: Settings
}

export type StepAction = 'start' | 'pickup' | 'delivery' | 'return'

export interface RouteStep {
  seq: number
  locationId: string
  action: StepAction
  orderId?: string
  machineId?: string
  /** Distance of the leg that leads to this step (km, 1 decimal). */
  legKm: number
  cumulativeKm: number
  /** Load on the truck after this step. */
  loadKg: number
  loadCount: number
  /** Elapsed working time after this step (hours). */
  cumulativeHours: number
}

export interface TruckPlan {
  truck: Truck
  orderIds: string[]
  steps: RouteStep[]
  totalKm: number
  driveHours: number
  handlingHours: number
  totalHours: number
  /** Hours counted against the daily limit under the selected mode. */
  limitedHours: number
  ordersCompleted: number
}

export interface UnassignedOrder {
  orderId: string
  reason: string
}

export interface Plan {
  trucks: TruckPlan[]
  unassigned: UnassignedOrder[]
  totalKm: number
  ordersCompleted: number
  solveMs: number
}
