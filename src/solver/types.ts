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

export interface Location {
  id: string
  name: string
  x: number
  y: number
}

export interface Order {
  id: string
  machineId: string
  pickupId: string
  deliveryId: string
}

/**
 * How the 9h daily limit is interpreted:
 * - 'drive+handling': driving time + loading/unloading time (default)
 * - 'drive': driving time only
 * - 'none': no time limit
 */
export type TimeLimitMode = 'drive+handling' | 'drive' | 'none'

export interface Settings {
  speedKmh: number
  handlingMinutes: number
  maxHoursPerDay: number
  timeLimitMode: TimeLimitMode
}

export interface ProblemInput {
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
