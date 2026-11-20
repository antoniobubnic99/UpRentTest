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

export function exportJson(input: ProblemInput): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, data: input }, null, 2)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Builds a clean ProblemInput from untrusted data (JSON file or share link). */
export function inputFromUnknown(raw: unknown): ProblemInput {
  const problems: string[] = []
  const root = isObj(raw) && isObj(raw.data) ? raw.data : raw
  if (isObj(raw) && raw.format !== undefined && raw.format !== FORMAT) problems.push(`Nepoznat format datoteke: ${String(raw.format)}.`)
  if (!isObj(root)) throw new ImportError(['Datoteka ne sadrži podatke planera.'])

  const arr = (key: string): Obj[] => {
    const v = root[key]
    if (v === undefined) return []
    if (!Array.isArray(v)) {
      problems.push(`Polje "${key}" mora biti lista.`)
      return []
    }
    return v.filter((x, i) => {
      if (!isObj(x)) problems.push(`${key}[${i}] nije ispravan zapis.`)
      return isObj(x)
    }) as Obj[]
  }

  const coordinateMode = root.coordinateMode === 'geo' ? 'geo' : 'xy'
  const trucks: Truck[] = arr('trucks').map((t, i) => ({
    id: str(t.id) ?? `T${i + 1}`,
    name: str(t.name) ?? str(t.id) ?? `Vozilo ${i + 1}`,
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
    throw new ImportError(['Datoteka nije ispravan JSON.'])
  }
  return inputFromUnknown(raw)
}

// ---------- CSV (orders) ----------

export const CSV_HEADER = ['nalog', 'stroj', 'tezina_kg', 'preuzimanje', 'isporuka', 'utovar_min', 'istovar_min']

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Orders as CSV with ";" separator (opens directly in Excel with Croatian locale). */
export function exportOrdersCsv(input: ProblemInput): string {
  const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const rows = input.orders.map((o) =>
    [o.id, o.machineId, weight.get(o.machineId), o.pickupId, o.deliveryId, o.pickupMinutes, o.deliveryMinutes]
      .map(csvCell)
      .join(';'),
  )
  return [CSV_HEADER.join(';'), ...rows].join('\r\n') + '\r\n'
}

/** Splits CSV text into rows of cells; supports quotes, ";" / "," / tab separators. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0]
  const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const parseNumber = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'))

/**
 * Replaces the orders (and their machines) with the ones from a CSV. Locations must already
 * exist; every problem is reported with its row number and nothing is changed on error.
 */
export function importOrdersCsv(input: ProblemInput, text: string): ProblemInput {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new ImportError(['CSV je prazan.'])
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const required = ['nalog', 'stroj', 'tezina_kg', 'preuzimanje', 'isporuka']
  const missing = required.filter((r) => col(r) < 0)
  if (missing.length) throw new ImportError([`CSV nema stupce: ${missing.join(', ')}. Očekivano zaglavlje: ${CSV_HEADER.join(';')}`])

  const locIds = new Set(input.locations.map((l) => l.id))
  const problems: string[] = []
  const orders: Order[] = []
  const machines: Machine[] = []
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
    const id = get('nalog')
    const machineId = get('stroj')
    const weight = parseNumber(get('tezina_kg'))
    const pickupId = get('preuzimanje')
    const deliveryId = get('isporuka')
    if (!id || !machineId) problems.push(`Red ${line}: nedostaje oznaka naloga ili stroja.`)
    if (!(weight > 0)) problems.push(`Red ${line}: težina mora biti broj veći od 0.`)
    for (const [label, loc] of [
      ['preuzimanja', pickupId],
      ['isporuke', deliveryId],
    ] as const) {
      if (!locIds.has(loc)) problems.push(`Red ${line}: lokacija ${label} "${loc}" ne postoji.`)
    }
    const order: Order = { id, machineId, pickupId, deliveryId }
    for (const [key, name] of [
      ['pickupMinutes', 'utovar_min'],
      ['deliveryMinutes', 'istovar_min'],
    ] as const) {
      const v = get(name)
      if (v !== '') {
        const n = parseNumber(v)
        if (!(n >= 0)) problems.push(`Red ${line}: ${name} mora biti broj ≥ 0.`)
        order[key] = n
      }
    }
    orders.push(order)
    machines.push({ id: machineId, weightKg: weight })
  })
  if (orders.length === 0) problems.push('CSV nema nijednog naloga.')
  if (problems.length) throw new ImportError(problems)
  return { ...input, orders, machines }
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
  const json = new TextEncoder().encode(JSON.stringify(input))
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
    throw new ImportError(['Link je oštećen ili nepotpun.'])
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
