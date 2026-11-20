/**
 * Address search via the public Nominatim API (OpenStreetMap), decision D4.
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * at most 1 request per second, no bulk geocoding, attribution shown in the UI.
 * The browser sends the page as Referer, which identifies the application.
 */

export interface GeocodeResult {
  name: string
  address: string
  lat: number
  lon: number
}

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
export const MIN_INTERVAL_MS = 1000

type Fetch = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

/** Serialises requests so that two consecutive calls are at least MIN_INTERVAL_MS apart. */
export function createGeocoder(fetchFn: Fetch = (u, i) => fetch(u, i), now = () => Date.now(), sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  let last = -Infinity
  let queue: Promise<unknown> = Promise.resolve()

  async function request(query: string, onlyCroatia: boolean, signal?: AbortSignal): Promise<GeocodeResult[]> {
    const wait = last + MIN_INTERVAL_MS - now()
    if (wait > 0) await sleep(wait)
    if (signal?.aborted) return []
    last = now()
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': 'hr', addressdetails: '0' })
    if (onlyCroatia) params.set('countrycodes', 'hr')
    const res = await fetchFn(`${NOMINATIM_URL}?${params}`, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Nominatim je vratio ${res.status}`)
    const rows = (await res.json()) as { display_name: string; name?: string; lat: string; lon: string }[]
    return rows
      .map((r) => ({
        name: r.name || r.display_name.split(',')[0].trim(),
        address: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
  }

  return function search(query: string, onlyCroatia = true, signal?: AbortSignal): Promise<GeocodeResult[]> {
    const q = query.trim()
    if (q.length < 3) return Promise.resolve([])
    const p = queue.then(() => request(q, onlyCroatia, signal))
    queue = p.catch(() => undefined)
    return p
  }
}

export const geocode = createGeocoder()
