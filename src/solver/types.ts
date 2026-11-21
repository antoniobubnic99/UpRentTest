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
  /**
   * 'geo' mode only: 'road' = driving distances from a routing service (OSRM), supplied as
   * ProblemInput.roadMatrix; 'air' = great-circle distance x roadFactor.
   */
  distanceSource: DistanceSource
  /**
   * 'geo' + road distances only: how driving time is measured.
   * - 'road' (default): per relation, from the routing service's travel time (e.g. a motorway
   *   leg is faster than a town leg), but never faster than truckMaxSpeedKmh
   * - 'speed': distance / speedKmh (average speed, as in the task)
   * In 'xy' mode (and without a road matrix) the average speed is always used.
   */
  travelTimeSource?: TravelTimeSource
  /** Upper bound on the average speed of one relation for a truck (km/h); default 80. */
  truckMaxSpeedKmh?: number
  /**
   * What to optimise after "most orders served":
   * - 'km' (default): fewest total km
   * - 'balanced': shortest longest working day (even workload) within balanceMaxExtraPct % of
   *   the minimum km, then fewest km
   */
  objective?: Objective
  /** 'balanced' only: how many % more km than the minimum may be spent on evening out the days (default 10). */
  balanceMaxExtraPct?: number
}

export type Objective = 'km' | 'balanced'

export type DistanceSource = 'road' | 'air'
export type TravelTimeSource = 'road' | 'speed'

/** Road distances between locations (km), fetched from a routing service before solving. */
export interface RoadMatrix {
  ids: string[]
  km: number[][]
  /** Driving time between locations (minutes) from the routing service (car profile). */
  minutes?: number[][]
}

export interface ProblemInput {
  coordinateMode: CoordinateMode
  /** 'geo' + distanceSource 'road': driving distances; without it air distance x factor is used. */
  roadMatrix?: RoadMatrix
  baseId: string
  trucks: Truck[]
  machines: Machine[]
  locations: Location[]
  orders: Order[]
  settings: Settings
}

export type StepAction = 'start' | 'pickup' | 'delivery' | 'break' | 'return'

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
  /** Elapsed working time when the truck arrives at this step (hours from the start of the day). */
  arrivalHours: number
  /** Elapsed working time when the truck leaves (after loading / unloading / break). */
  departureHours: number
  /** Same as departureHours; kept for the step table. */
  cumulativeHours: number
  /** Driving time of the leg that leads to this step (hours); 0 for start and break. */
  legHours: number
}

export interface TruckPlan {
  truck: Truck
  orderIds: string[]
  steps: RouteStep[]
  totalKm: number
  driveHours: number
  handlingHours: number
  /** Mandatory break (0 when disabled or the truck has no orders). */
  breakHours: number
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
  /** Which algorithm produced the plan (decision D3). */
  solverUsed: 'exact' | 'heuristic'
  /** How distances were measured: grid (task), road (OSRM) or air x factor. */
  distanceUsed: 'xy' | 'road' | 'air'
  /** How driving time was measured: average speed, or per relation from the road service. */
  timeUsed: 'speed' | 'road'
  /**
   * Exact solver with per-relation times only: number of (truck, order subset) pairs whose
   * shortest route broke the daily limit while a slower-in-km but faster route fitted; the
   * fastest route was used for them, so the optimum is not proven. 0 = proven optimal.
   */
  timeFallbacks: number
}
