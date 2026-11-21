import { tr } from '../i18n'
import type { Location, RoadMatrix } from '../solver/types'

/**
 * Road distances and route shapes from OSRM (OpenStreetMap road network).
 * The public demo server (router.project-osrm.org) is used without a key; it is meant for
 * light use, so results are cached and the app falls back to air distance x factor when it
 * is unavailable. For production this would be a self-hosted OSRM or a commercial API.
 */

export const OSRM_URL = 'https://router.project-osrm.org'
/** Public server limit for the table service. */
export const MAX_TABLE_LOCATIONS = 100

type Fetch = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

const coord = (l: { lat?: number; lon?: number }) => `${l.lon!.toFixed(6)},${l.lat!.toFixed(6)}`

const matrixCache = new Map<string, RoadMatrix>()
const routeCache = new Map<string, [number, number][]>()

export function clearRoutingCache() {
  matrixCache.clear()
  routeCache.clear()
}

/** Driving distances (km) and travel times (minutes) between all locations, from the OSRM table service. */
export async function fetchRoadMatrix(
  locations: Location[],
  fetchFn: Fetch = (u, i) => fetch(u, i),
  signal?: AbortSignal,
): Promise<RoadMatrix> {
  if (locations.length > MAX_TABLE_LOCATIONS)
    throw new Error(tr('route.tooMany', { max: MAX_TABLE_LOCATIONS }))
  const key = locations.map((l) => `${l.id}@${coord(l)}`).join(';')
  const cached = matrixCache.get(key)
  if (cached) return cached
  const url = `${OSRM_URL}/table/v1/driving/${locations.map(coord).join(';')}?annotations=distance,duration`
  const res = await fetchFn(url, { signal })
  if (!res.ok) throw new Error(tr('route.status', { status: res.status }))
  const body = (await res.json()) as {
    code: string
    distances?: (number | null)[][]
    durations?: (number | null)[][]
    message?: string
  }
  if (body.code !== 'Ok' || !body.distances) throw new Error(tr('route.error', { msg: body.message ?? body.code }))
  const matrix: RoadMatrix = {
    ids: locations.map((l) => l.id),
    km: body.distances.map((row) => row.map((m) => (m === null ? NaN : m / 1000))),
  }
  if (body.durations) matrix.minutes = body.durations.map((row) => row.map((sec) => (sec === null ? NaN : sec / 60)))
  matrixCache.set(key, matrix)
  return matrix
}

/** Road geometry ([lat, lon] points) through the given stops, from the OSRM route service. */
export async function fetchRouteGeometry(
  stops: [number, number][],
  fetchFn: Fetch = (u, i) => fetch(u, i),
  signal?: AbortSignal,
): Promise<[number, number][]> {
  const pts = stops.filter((p, i) => i === 0 || p[0] !== stops[i - 1][0] || p[1] !== stops[i - 1][1])
  if (pts.length < 2) return pts
  const key = pts.map((p) => p.join(',')).join(';')
  const cached = routeCache.get(key)
  if (cached) return cached
  const path = pts.map(([lat, lon]) => coord({ lat, lon })).join(';')
  const res = await fetchFn(`${OSRM_URL}/route/v1/driving/${path}?overview=full&geometries=geojson`, { signal })
  if (!res.ok) throw new Error(tr('route.status', { status: res.status }))
  const body = (await res.json()) as { code: string; routes?: { geometry: { coordinates: [number, number][] } }[] }
  if (body.code !== 'Ok' || !body.routes?.[0]) throw new Error(tr('route.error', { msg: body.code }))
  const line = body.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
  routeCache.set(key, line)
  return line
}

/**
 * Points along a polyline every `stepKm` (at least one, at most `max`), with the direction
 * to the next point, for drawing arrows on curved road geometry.
 */
export function arrowPoints(
  line: [number, number][],
  stepKm: number,
  max = 40,
): { at: [number, number]; next: [number, number] }[] {
  const R = 6371.0088
  const d = (a: [number, number], b: [number, number]) => {
    const rad = Math.PI / 180
    const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad)
    const y = (b[0] - a[0]) * rad
    return Math.sqrt(x * x + y * y) * R
  }
  let total = 0
  for (let i = 1; i < line.length; i++) total += d(line[i - 1], line[i])
  if (total === 0) return []
  const step = Math.max(stepKm, total / max)
  const out: { at: [number, number]; next: [number, number] }[] = []
  let acc = 0
  let target = step / 2
  for (let i = 1; i < line.length && out.length < max; i++) {
    const seg = d(line[i - 1], line[i])
    while (seg > 0 && acc + seg >= target && out.length < max) {
      const t = (target - acc) / seg
      const at: [number, number] = [
        line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
        line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
      ]
      out.push({ at, next: line[i] })
      target += step
    }
    acc += seg
  }
  return out
}
