import { getLang, tr } from '../i18n'
import { defaultSettings } from './defaultData'
import type { Location, Machine, Order, ProblemInput, Settings, Truck } from '../solver/types'

/**
 * Import / export of the input data:
 * - JSON file with the whole data set (vehicles, locations, machines, orders, settings)
 * - CSV of orders (Excel-friendly: ";" separator, decimal comma accepted)
 * - share link: the data set compressed into the URL fragment (#d=...), nothing is sent to a server
 *
 * Everything that comes in is validated structurally here; business rules are then checked
 * by checkInput() as for data typed in the UI.
 */

export const FORMAT = 'uprent-logistics-planner'

/** Largest file accepted for import (Excel, CSV, JSON): keeps a broken or hostile file from freezing the browser. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** Most rows accepted per section (vehicles, locations, orders). */
export const MAX_ROWS = 2000

/** Throws when a file is larger than MAX_FILE_BYTES. */
export function checkFileSize(bytes: number) {
  if (bytes > MAX_FILE_BYTES)
    throw new ImportError([tr('io.tooBig', { mb: Math.round((bytes / 1024 / 1024) * 10) / 10, max: MAX_FILE_BYTES / 1024 / 1024 })])
}
export const VERSION = 1

export class ImportError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(problems.join('\n'))
    this.name = 'ImportError'
    this.problems = problems
  }
}

// ---------- JSON ----------

/** The data set without derived data (road distances are fetched again when solving). */
export function stripDerived(input: ProblemInput): ProblemInput {
  const { roadMatrix: _roadMatrix, ...rest } = input
  void _roadMatrix
  return rest
}

export function exportJson(input: ProblemInput): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, data: stripDerived(input) }, null, 2)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Builds a clean ProblemInput from untrusted data (JSON file or share link). */
export function inputFromUnknown(raw: unknown): ProblemInput {
  const problems: string[] = []
  const root = isObj(raw) && isObj(raw.data) ? raw.data : raw
  if (isObj(raw) && raw.format !== undefined && raw.format !== FORMAT) problems.push(tr('io.unknownFormat', { format: String(raw.format) }))
  if (!isObj(root)) throw new ImportError([tr('io.noData')])

  const arr = (key: string): Obj[] => {
    const v = root[key]
    if (v === undefined) return []
    if (!Array.isArray(v)) {
      problems.push(tr('io.notList', { key }))
      return []
    }
    if (v.length > MAX_ROWS) throw new ImportError([tr('io.tooManyRows', { what: key, n: v.length, max: MAX_ROWS })])
    return v.filter((x, i) => {
      if (!isObj(x)) problems.push(tr('io.badRecord', { key, i }))
      return isObj(x)
    }) as Obj[]
  }

  const coordinateMode = root.coordinateMode === 'geo' ? 'geo' : 'xy'
  const trucks: Truck[] = arr('trucks').map((t, i) => ({
    id: str(t.id) ?? `T${i + 1}`,
    name: str(t.name) ?? str(t.id) ?? tr('data.vehicleN', { n: i + 1 }),
    capacityKg: num(t.capacityKg) ?? NaN,
    maxItems: num(t.maxItems) ?? NaN,
  }))
  const locations: Location[] = arr('locations').map((l, i) => {
    const loc: Location = { id: str(l.id) ?? `L${i}`, name: str(l.name) ?? str(l.id) ?? `L${i}` }
    if (coordinateMode === 'geo') {
      loc.lat = num(l.lat) ?? NaN
      loc.lon = num(l.lon) ?? NaN
      if (str(l.address)) loc.address = str(l.address)
    } else {
      loc.x = num(l.x) ?? NaN
      loc.y = num(l.y) ?? NaN
    }
    return loc
  })
  const machines: Machine[] = arr('machines').map((m, i) => ({
    id: str(m.id) ?? `M${i + 1}`,
    weightKg: num(m.weightKg) ?? NaN,
  }))
  const orders: Order[] = arr('orders').map((o, i) => {
    const order: Order = {
      id: str(o.id) ?? `N${i + 1}`,
      machineId: str(o.machineId) ?? '',
      pickupId: str(o.pickupId) ?? '',
      deliveryId: str(o.deliveryId) ?? '',
    }
    if (o.pickupMinutes !== undefined && o.pickupMinutes !== null) order.pickupMinutes = num(o.pickupMinutes) ?? NaN
    if (o.deliveryMinutes !== undefined && o.deliveryMinutes !== null) order.deliveryMinutes = num(o.deliveryMinutes) ?? NaN
    return order
  })

  const s = isObj(root.settings) ? root.settings : {}
  const pick = <K extends keyof Settings>(k: K, ok: (v: unknown) => boolean): Settings[K] =>
    (ok(s[k]) ? s[k] : defaultSettings[k]) as Settings[K]
  const settings: Settings = {
    speedKmh: pick('speedKmh', (v) => num(v) !== undefined),
    handlingMinutes: pick('handlingMinutes', (v) => num(v) !== undefined),
    maxHoursPerDay: pick('maxHoursPerDay', (v) => num(v) !== undefined),
    timeLimitMode: pick('timeLimitMode', (v) => v === 'drive+handling' || v === 'drive' || v === 'none'),
    breakEnabled: pick('breakEnabled', (v) => typeof v === 'boolean'),
    breakMinutes: pick('breakMinutes', (v) => num(v) !== undefined),
    solverMode: pick('solverMode', (v) => v === 'auto' || v === 'exact' || v === 'heuristic'),
    roadFactor: pick('roadFactor', (v) => num(v) !== undefined),
    distanceSource: pick('distanceSource', (v) => v === 'road' || v === 'air'),
    travelTimeSource: pick('travelTimeSource', (v) => v === 'road' || v === 'speed'),
    truckMaxSpeedKmh: pick('truckMaxSpeedKmh', (v) => num(v) !== undefined),
    objective: pick('objective', (v) => v === 'km' || v === 'balanced'),
    balanceMaxExtraPct: pick('balanceMaxExtraPct', (v) => num(v) !== undefined),
  }

  const baseId = str(root.baseId) ?? locations[0]?.id ?? ''
  if (problems.length) throw new ImportError(problems)
  return { coordinateMode, baseId, trucks, locations, machines, orders, settings }
}

export function importJson(text: string): ProblemInput {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError([tr('io.badJson')])
  }
  return inputFromUnknown(raw)
}

// ---------- CSV ----------
//
// One CSV file with three sections (vehicles, locations, orders), each started by a marker
// row ("#VOZILA", "#LOKACIJE", "#NALOZI") and its own header row. Section markers and column
// names are accepted in Croatian, English, French and German; files are written in the
// current language. ";" separator, decimal comma accepted, UTF-8 with BOM (Excel).
// The single-section functions (vehicles / locations / orders) are kept for the tests and as
// building blocks.

export type Section = 'trucks' | 'locations' | 'orders'
export type CsvKind = Section

/** Column ids (canonical = Croatian) with their names in hr / en / fr / de. */
export const COLUMNS: Record<Section, [string, string, string, string][]> = {
  trucks: [
    ['id', 'id', 'id', 'id'],
    ['naziv', 'name', 'nom', 'bezeichnung'],
    ['nosivost_kg', 'capacity_kg', 'charge_utile_kg', 'nutzlast_kg'],
    ['max_strojeva', 'max_machines', 'max_machines', 'max_maschinen'],
  ],
  locations: [
    ['id', 'id', 'id', 'id'],
    ['naziv', 'name', 'nom', 'bezeichnung'],
    ['x_km', 'x_km', 'x_km', 'x_km'],
    ['y_km', 'y_km', 'y_km', 'y_km'],
    ['lat', 'lat', 'lat', 'lat'],
    ['lon', 'lon', 'lon', 'lon'],
    ['adresa', 'address', 'adresse', 'adresse'],
    ['baza', 'base', 'base', 'basis'],
  ],
  orders: [
    ['nalog', 'order', 'ordre', 'auftrag'],
    ['stroj', 'machine', 'machine', 'maschine'],
    ['tezina_kg', 'weight_kg', 'poids_kg', 'gewicht_kg'],
    ['preuzimanje', 'pickup', 'enlevement', 'abholung'],
    ['isporuka', 'delivery', 'livraison', 'lieferung'],
    ['utovar_min', 'loading_min', 'chargement_min', 'beladen_min'],
    ['istovar_min', 'unloading_min', 'dechargement_min', 'entladen_min'],
  ],
}
export const SECTION_NAMES: Record<Section, [string, string, string, string]> = {
  trucks: ['VOZILA', 'VEHICLES', 'VEHICULES', 'FAHRZEUGE'],
  locations: ['LOKACIJE', 'LOCATIONS', 'LIEUX', 'STANDORTE'],
  orders: ['NALOZI', 'ORDERS', 'ORDRES', 'AUFTRAEGE'],
}
export const LANG_INDEX: Record<string, number> = { hr: 0, en: 1, fr: 2, de: 3 }

const fold = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')

/** Canonical column id for a header cell in any supported language, or the folded cell. */
function canonical(section: Section, cell: string): string {
  const f = fold(cell)
  const col = COLUMNS[section].find((names) => names.some((n) => fold(n) === f))
  return col ? col[0] : f
}

/** Name of a column in the current language. */
const colName = (section: Section, id: string) => COLUMNS[section].find((c) => c[0] === id)![LANG_INDEX[getLang()]]

export const headerOf = (section: Section, lang = getLang()) => COLUMNS[section].map((c) => c[LANG_INDEX[lang]])

export const CSV_HEADER = COLUMNS.orders.map((c) => c[0])
export const TRUCKS_HEADER = COLUMNS.trucks.map((c) => c[0])
export const LOCATIONS_HEADER = COLUMNS.locations.map((c) => c[0])

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? '' : typeof v === 'number' ? String(v) : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: (string | number | undefined)[][]): string {
  return [header.join(';'), ...rows.map((r) => r.map(csvCell).join(';'))].join('\r\n') + '\r\n'
}

export interface CsvRow {
  /** 1-based line number in the file (or row number in the Excel sheet) */
  line: number
  /** Excel sheet name, for error messages */
  sheet?: string
  cells: string[]
}

/** Splits CSV text into rows of cells with line numbers; supports quotes, ";" / "," / tab. */
function parseCsvRows(text: string): CsvRow[] {
  const clean = text.replace(/^﻿/, '')
  const sep = clean.includes(';') ? ';' : clean.includes('\t') ? '\t' : ','
  const rows: CsvRow[] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  const flush = () => {
    row.push(cell)
    if (row.some((x) => x.trim() !== '')) rows.push({ line: rowLine, cells: row })
    row = []
    cell = ''
  }
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else {
        if (c === '\n') line++
        cell += c
      }
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      flush()
      line++
      rowLine = line
    } else cell += c
  }
  flush()
  return rows
}

/** Splits CSV text into rows of cells; supports quotes, ";" / "," / tab separators. */
export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map((r) => r.cells)
}

const parseNumber = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'))

type Table = { line: number; sheet?: string; get: (name: string) => string }[]

/** Header row + data rows of one section; checks the required columns. */
function toTable(section: Section, rows: CsvRow[], required: string[]): Table {
  if (rows.length === 0) throw new ImportError([tr('csv.empty')])
  const header = rows[0].cells.map((h) => canonical(section, h))
  const missing = required.filter((r) => !header.includes(r))
  if (missing.length)
    throw new ImportError([
      tr('csv.missingColumns', {
        section: SECTION_NAMES[section][LANG_INDEX[getLang()]],
        cols: missing.map((m) => COLUMNS[section].find((c) => c[0] === m)![LANG_INDEX[getLang()]]).join(', '),
        header: headerOf(section).join(';'),
      }),
    ])
  return rows.slice(1).map((r) => ({
    line: r.line,
    sheet: r.sheet,
    get: (name: string) => {
      const c = header.indexOf(name)
      return c >= 0 ? (r.cells[c] ?? '').trim() : ''
    },
  }))
}

const row = (line: number, sheet: string | undefined, text: string) =>
  sheet ? tr('xlsx.row', { sheet, line, text }) : tr('csv.row', { line, text })
const YES = new Set(['da', 'd', 'x', '1', 'yes', 'y', 'true', 'oui', 'o', 'ja', 'j'])

function readTrucks(t: Table, problems: string[]): Truck[] {
  const trucks: Truck[] = t.map(({ line, sheet, get }) => {
    const id = get('id')
    const capacityKg = parseNumber(get('nosivost_kg'))
    const maxItems = parseNumber(get('max_strojeva'))
    if (!id) problems.push(row(line, sheet, tr('csv.noTruckId')))
    if (!(capacityKg > 0)) problems.push(row(line, sheet, tr('csv.capacity')))
    if (!(Number.isInteger(maxItems) && maxItems >= 1)) problems.push(row(line, sheet, tr('csv.maxItems')))
    return { id, name: get('naziv') || tr('data.truckName', { id }), capacityKg, maxItems }
  })
  const ids = trucks.map((x) => x.id)
  const dup = ids.filter((id, i) => id && ids.indexOf(id) !== i)
  if (dup.length) problems.push(tr('csv.dupTrucks', { ids: [...new Set(dup)].join(', ') }))
  if (trucks.length === 0) problems.push(tr('csv.noTrucks'))
  return trucks
}

function readLocations(t: Table, problems: string[]) {
  const xy = t.some((r) => r.get('x_km') !== '' || r.get('y_km') !== '')
  const toGeocode: string[] = []
  let baseId = ''
  const locations: Location[] = t.map(({ line, sheet, get }) => {
    const id = get('id')
    if (!id) problems.push(row(line, sheet, tr('csv.noLocationId')))
    const loc: Location = { id, name: get('naziv') || id }
    if (YES.has(fold(get('baza')))) {
      if (baseId) problems.push(row(line, sheet, tr('csv.twoBases', { base: baseId })))
      else baseId = id
    }
    if (xy) {
      loc.x = parseNumber(get('x_km'))
      loc.y = parseNumber(get('y_km'))
      if (!Number.isFinite(loc.x) || !Number.isFinite(loc.y)) problems.push(row(line, sheet, tr('csv.xy')))
    } else {
      const lat = get('lat')
      const lon = get('lon')
      const address = get('adresa')
      if (address) loc.address = address
      if (lat !== '' || lon !== '') {
        loc.lat = parseNumber(lat)
        loc.lon = parseNumber(lon)
        if (!(Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180)) problems.push(row(line, sheet, tr('csv.latLon')))
      } else if (address) {
        loc.lat = NaN
        loc.lon = NaN
        toGeocode.push(id)
      } else problems.push(row(line, sheet, tr('csv.noPosition')))
    }
    return loc
  })
  const ids = locations.map((l) => l.id)
  const dup = ids.filter((id, i) => id && ids.indexOf(id) !== i)
  if (dup.length) problems.push(tr('csv.dupLocations', { ids: [...new Set(dup)].join(', ') }))
  if (locations.length === 0) problems.push(tr('csv.noLocations'))
  return { xy, locations, baseId, toGeocode }
}

function readOrders(t: Table, locIds: Set<string>, problems: string[]) {
  const orders: Order[] = []
  const machines: Machine[] = []
  for (const { line, sheet, get } of t) {
    const id = get('nalog')
    const machineId = get('stroj')
    const weight = parseNumber(get('tezina_kg'))
    const pickupId = get('preuzimanje')
    const deliveryId = get('isporuka')
    if (!id || !machineId) problems.push(row(line, sheet, tr('csv.noOrderId')))
    if (!(weight > 0)) problems.push(row(line, sheet, tr('csv.weight')))
    if (!locIds.has(pickupId)) problems.push(row(line, sheet, tr('csv.noPickup', { loc: pickupId })))
    if (!locIds.has(deliveryId)) problems.push(row(line, sheet, tr('csv.noDelivery', { loc: deliveryId })))
    if (pickupId && pickupId === deliveryId) problems.push(row(line, sheet, tr('csv.sameLocation', { loc: pickupId })))
    const order: Order = { id, machineId, pickupId, deliveryId }
    for (const [key, name] of [
      ['pickupMinutes', 'utovar_min'],
      ['deliveryMinutes', 'istovar_min'],
    ] as const) {
      const v = get(name)
      if (v !== '') {
        const n = parseNumber(v)
        if (!(n >= 0)) problems.push(row(line, sheet, tr('csv.minutes', { col: colName('orders', name) })))
        order[key] = n
      }
    }
    orders.push(order)
    machines.push({ id: machineId, weightKg: weight })
  }
  if (orders.length === 0) problems.push(tr('csv.noOrders'))
  return { orders, machines }
}

// ----- single sections (kept for compatibility and tests) -----

/** Replaces the orders (and their machines); locations must already exist; nothing changes on error. */
export function importOrdersCsv(input: ProblemInput, text: string): ProblemInput {
  const problems: string[] = []
  const t = toTable('orders', parseCsvRows(text), ['nalog', 'stroj', 'tezina_kg', 'preuzimanje', 'isporuka'])
  const { orders, machines } = readOrders(t, new Set(input.locations.map((l) => l.id)), problems)
  if (problems.length) throw new ImportError(problems)
  return { ...input, orders, machines }
}

/** Replaces the vehicles. */
export function importTrucksCsv(input: ProblemInput, text: string): ProblemInput {
  const problems: string[] = []
  const trucks = readTrucks(toTable('trucks', parseCsvRows(text), ['id', 'nosivost_kg', 'max_strojeva']), problems)
  if (problems.length) throw new ImportError(problems)
  return { ...input, trucks }
}

/**
 * Replaces the locations. The coordinate mode follows the file: x_km / y_km filled -> task
 * grid; otherwise real map (lat / lon, or only an address that the app then geocodes).
 * Returns the ids that still need geocoding. Orders must keep pointing at existing locations.
 */
export function importLocationsCsv(input: ProblemInput, text: string): { input: ProblemInput; toGeocode: string[] } {
  const problems: string[] = []
  const r = readLocations(toTable('locations', parseCsvRows(text), ['id']), problems)
  const known = new Set(r.locations.map((l) => l.id))
  const broken = input.orders.filter((o) => !known.has(o.pickupId) || !known.has(o.deliveryId)).map((o) => o.id)
  if (broken.length) problems.push(tr('csv.brokenOrders', { ids: broken.join(', ') }))
  if (problems.length) throw new ImportError(problems)
  const baseId = r.baseId || (known.has(input.baseId) ? input.baseId : r.locations[0].id)
  return { input: { ...input, coordinateMode: r.xy ? 'xy' : 'geo', locations: r.locations, baseId }, toGeocode: r.toGeocode }
}

export function exportOrdersCsv(input: ProblemInput, lang = 'hr' as Parameters<typeof headerOf>[1]): string {
  return toCsv(headerOf('orders', lang), orderRows(input))
}
export function exportTrucksCsv(input: ProblemInput): string {
  return toCsv(headerOf('trucks', 'hr'), truckRows(input))
}
export function exportLocationsCsv(input: ProblemInput): string {
  return toCsv(headerOf('locations', 'hr'), locationRows(input, 'da'))
}

export const truckRows = (input: ProblemInput) => input.trucks.map((t) => [t.id, t.name, t.capacityKg, t.maxItems])
export const locationRows = (input: ProblemInput, yes: string) =>
  input.locations.map((l) => [l.id, l.name, l.x, l.y, l.lat, l.lon, l.address, l.id === input.baseId ? yes : ''])
export const orderRows = (input: ProblemInput) => {
  const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  return input.orders.map((o) => [o.id, o.machineId, weight.get(o.machineId), o.pickupId, o.deliveryId, o.pickupMinutes, o.deliveryMinutes])
}

/** Single-section templates (Croatian headers). */
export function templateCsv(kind: CsvKind): string {
  const ex = templateRows()
  return toCsv(headerOf(kind, 'hr'), kind === 'trucks' ? ex.trucks : kind === 'locations' ? ex.locations : ex.orders)
}

export function templateRows() {
  return {
    trucks: [
      ['A', tr('data.truckName', { id: 'A' }), 3500, 2],
      ['B', tr('data.truckName', { id: 'B' }), 10000, 3],
    ],
    locations: [
      ['L0', tr('csv.exBase'), '', '', '', '', 'Industrijska ulica 24, Hrušćica', tr('csv.yes')],
      ['L1', tr('csv.exSite'), '', '', '', '', 'Ilica 10, Zagreb', ''],
      ['L2', tr('csv.exStore'), '', '', 45.7125, 16.0758, '', ''],
    ],
    orders: [
      ['N01', 'M01', 800, 'L0', 'L1', '', ''],
      ['N02', 'M02', 2400, 'L1', 'L2', 45, ''],
    ],
  }
}

// ----- one file with all three sections -----

function combined(
  trucks: (string | number | undefined)[][],
  locations: (string | number | undefined)[][],
  orders: (string | number | undefined)[][],
): string {
  const lang = getLang()
  const i = LANG_INDEX[lang]
  const part = (section: Section, rows: (string | number | undefined)[][]) =>
    `#${SECTION_NAMES[section][i]}\r\n` + toCsv(headerOf(section, lang), rows)
  return [part('trucks', trucks), part('locations', locations), part('orders', orders)].join('\r\n')
}

/** Template with all three sections and example rows (in the current language). */
export function templateAllCsv(): string {
  const ex = templateRows()
  return combined(ex.trucks, ex.locations, ex.orders)
}

/** The whole data set (vehicles, locations, orders) as one CSV. */
export function exportAllCsv(input: ProblemInput): string {
  return combined(truckRows(input), locationRows(input, tr('csv.yes')), orderRows(input))
}

/** Which section a marker row ("#VOZILA", "#ORDERS", ...) starts, or null. */
export function sectionOf(cell: string): Section | null {
  const m = fold(cell).replace(/^#+/, '').toUpperCase()
  for (const s of Object.keys(SECTION_NAMES) as Section[])
    if (SECTION_NAMES[s].some((n) => fold(n).toUpperCase() === m)) return s
  return null
}

/**
 * Imports one CSV with the sections #VOZILA, #LOKACIJE and #NALOZI (any of the supported
 * languages). Every section present replaces that part of the data; a missing section keeps
 * the current data. Orders are checked against the resulting locations. All problems are
 * reported with their line numbers and nothing changes on error.
 * Returns the location ids that still need geocoding (address only).
 */
export function importAllCsv(input: ProblemInput, text: string): { input: ProblemInput; toGeocode: string[]; sections: CsvKind[] } {
  const rows = parseCsvRows(text)
  if (rows.length === 0) throw new ImportError([tr('csv.empty')])
  const parts = new Map<Section, CsvRow[]>()
  let currentSection: Section | null = null
  for (const r of rows) {
    const first = r.cells[0]?.trim() ?? ''
    if (first.startsWith('#')) {
      const sec = sectionOf(first)
      if (!sec) throw new ImportError([row(r.line, undefined, tr('csv.unknownSection', { name: first }))])
      if (parts.has(sec)) throw new ImportError([row(r.line, undefined, tr('csv.sectionTwice', { name: first }))])
      currentSection = sec
      parts.set(sec, [])
      continue
    }
    if (!currentSection) throw new ImportError([tr('csv.noSections')])
    parts.get(currentSection)!.push(r)
  }

  return importSections(input, parts)
}

/**
 * Applies the sections that are present (vehicles, locations, orders) to the data set.
 * Shared by the CSV and the Excel import; nothing changes when there is any problem.
 */
export function importSections(
  input: ProblemInput,
  parts: Map<Section, CsvRow[]>,
): { input: ProblemInput; toGeocode: string[]; sections: CsvKind[] } {
  for (const [sec, rows] of parts)
    if (rows.length - 1 > MAX_ROWS)
      throw new ImportError([tr('io.tooManyRows', { what: SECTION_NAMES[sec][LANG_INDEX[getLang()]], n: rows.length - 1, max: MAX_ROWS })])
  const problems: string[] = []
  const tryTable = (sec: Section, required: string[]): Table | null => {
    const p = parts.get(sec)
    if (!p) return null
    try {
      return toTable(sec, p, required)
    } catch (e) {
      if (e instanceof ImportError) problems.push(...e.problems)
      else throw e
      return null
    }
  }
  const tTrucks = tryTable('trucks', ['id', 'nosivost_kg', 'max_strojeva'])
  const tLocations = tryTable('locations', ['id'])
  const tOrders = tryTable('orders', ['nalog', 'stroj', 'tezina_kg', 'preuzimanje', 'isporuka'])

  let next: ProblemInput = { ...input }
  let toGeocode: string[] = []
  if (tTrucks) next.trucks = readTrucks(tTrucks, problems)
  if (tLocations) {
    const r = readLocations(tLocations, problems)
    const known = new Set(r.locations.map((l) => l.id))
    const baseId = r.baseId || (known.has(input.baseId) ? input.baseId : (r.locations[0]?.id ?? ''))
    next = { ...next, coordinateMode: r.xy ? 'xy' : 'geo', locations: r.locations, baseId }
    toGeocode = r.toGeocode
  }
  if (tOrders) {
    const { orders, machines } = readOrders(tOrders, new Set(next.locations.map((l) => l.id)), problems)
    next = { ...next, orders, machines }
  } else if (tLocations) {
    const known = new Set(next.locations.map((l) => l.id))
    const broken = next.orders.filter((o) => !known.has(o.pickupId) || !known.has(o.deliveryId)).map((o) => o.id)
    if (broken.length) problems.push(tr('csv.brokenOrders', { ids: broken.join(', ') }))
  }
  if (problems.length) throw new ImportError(problems)
  return { input: next, toGeocode, sections: [...parts.keys()] }
}

// ---------- share link ----------

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** Compressed (deflate) data set for the URL fragment; "z." marks compression, "j." plain JSON. */
export async function encodeShare(input: ProblemInput): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(stripDerived(input)))
  if (typeof CompressionStream === 'undefined') return `j.${toBase64Url(json)}`
  return `z.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`
}

export async function decodeShare(token: string): Promise<ProblemInput> {
  try {
    const [kind, payload] = [token.slice(0, 2), token.slice(2)]
    let bytes = fromBase64Url(payload)
    if (kind === 'z.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    else if (kind !== 'j.') throw new Error('kind')
    return inputFromUnknown(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError([tr('io.badLink')])
  }
}

export const SHARE_PARAM = 'd'

export async function shareUrl(input: ProblemInput, base: string): Promise<string> {
  return `${base.split('#')[0]}#${SHARE_PARAM}=${await encodeShare(input)}`
}

/** Token from a location hash like "#d=z.xxxx", or null. */
export function shareTokenFromHash(hash: string): string | null {
  const m = hash.match(new RegExp(`[#&]${SHARE_PARAM}=([^&]+)`))
  return m ? m[1] : null
}
