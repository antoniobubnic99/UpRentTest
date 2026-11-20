import type { ProblemInput, Settings } from '../solver/types'

/** Default settings; the break is off so the task data still gives 200,1 km (decision D1). */
export const defaultSettings: Settings = {
  speedKmh: 60,
  handlingMinutes: 20,
  maxHoursPerDay: 9,
  timeLimitMode: 'drive+handling',
  breakEnabled: false,
  breakMinutes: 30,
  solverMode: 'auto',
  roadFactor: 1.3,
  distanceSource: 'road',
}

/** Input data exactly as given in the UP RENT task description. */
export const defaultInput: ProblemInput = {
  coordinateMode: 'xy',
  baseId: 'L0',
  trucks: [
    { id: 'A', name: 'Kamion A', capacityKg: 3500, maxItems: 2 },
    { id: 'B', name: 'Kamion B', capacityKg: 10000, maxItems: 3 },
  ],
  machines: [
    { id: 'M01', weightKg: 800 },
    { id: 'M02', weightKg: 1300 },
    { id: 'M03', weightKg: 1800 },
    { id: 'M04', weightKg: 2400 },
    { id: 'M05', weightKg: 3100 },
    { id: 'M06', weightKg: 3900 },
    { id: 'M07', weightKg: 4800 },
    { id: 'M08', weightKg: 6100 },
    { id: 'M09', weightKg: 7500 },
    { id: 'M10', weightKg: 9400 },
  ],
  locations: [
    { id: 'L0', name: 'Baza', x: 0, y: 0 },
    { id: 'L1', name: 'L1', x: 3, y: 8 },
    { id: 'L2', name: 'L2', x: 10, y: 11 },
    { id: 'L3', name: 'L3', x: 17, y: 9 },
    { id: 'L4', name: 'L4', x: 9, y: -6 },
    { id: 'L5', name: 'L5', x: 26, y: 3 },
    { id: 'L6', name: 'L6', x: -7, y: 13 },
    { id: 'L7', name: 'L7', x: 20, y: -8 },
    { id: 'L8', name: 'L8', x: 23, y: 15 },
    { id: 'L9', name: 'L9', x: -8, y: -5 },
  ],
  orders: [
    { id: 'N01', machineId: 'M01', pickupId: 'L1', deliveryId: 'L3' },
    { id: 'N02', machineId: 'M02', pickupId: 'L2', deliveryId: 'L5' },
    { id: 'N03', machineId: 'M03', pickupId: 'L9', deliveryId: 'L4' },
    { id: 'N04', machineId: 'M04', pickupId: 'L3', deliveryId: 'L0' },
    { id: 'N05', machineId: 'M05', pickupId: 'L0', deliveryId: 'L8' },
    { id: 'N06', machineId: 'M06', pickupId: 'L5', deliveryId: 'L7' },
    { id: 'N07', machineId: 'M07', pickupId: 'L8', deliveryId: 'L2' },
    { id: 'N08', machineId: 'M08', pickupId: 'L4', deliveryId: 'L9' },
    { id: 'N09', machineId: 'M09', pickupId: 'L6', deliveryId: 'L1' },
    { id: 'N10', machineId: 'M10', pickupId: 'L7', deliveryId: 'L3' },
  ],
  settings: { ...defaultSettings },
}

/** Deep copy so the UI can edit data without mutating the defaults. */
export function cloneDefaultInput(): ProblemInput {
  return structuredClone(defaultInput)
}

/**
 * Empty starting state (requirement 3): no trucks, locations or orders.
 * Settings stay at their defaults so the user only has to fill in the data.
 */
export function emptyInput(coordinateMode: ProblemInput['coordinateMode'] = 'xy'): ProblemInput {
  return {
    coordinateMode,
    baseId: '',
    trucks: [],
    machines: [],
    locations: [],
    orders: [],
    settings: { ...defaultSettings },
  }
}

/** True when there is nothing to plan yet. */
export function isEmptyInput(input: ProblemInput): boolean {
  return input.trucks.length === 0 && input.locations.length === 0 && input.orders.length === 0
}

/**
 * Demo for the real-map mode: the task's trucks, machines and orders, with the ten
 * locations placed in towns around Zagreb (town-centre coordinates, approximate).
 */
export function geoExampleInput(): ProblemInput {
  const towns: [string, number, number][] = [
    ['Baza (Zagreb)', 45.8131, 15.9775],
    ['Zaprešić', 45.8566, 15.8078],
    ['Sesvete', 45.8306, 16.1131],
    ['Dugo Selo', 45.8072, 16.2394],
    ['Velika Gorica', 45.7125, 16.0758],
    ['Vrbovec', 45.8833, 16.4247],
    ['Samobor', 45.8011, 15.711],
    ['Ivanić-Grad', 45.7081, 16.3953],
    ['Sveta Nedelja', 45.7978, 15.7792],
    ['Jastrebarsko', 45.6686, 15.6519],
  ]
  const input = cloneDefaultInput()
  return {
    ...input,
    coordinateMode: 'geo',
    locations: towns.map(([name, lat, lon], i) => ({ id: `L${i}`, name, lat, lon })),
  }
}
