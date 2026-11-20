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
  /** short context shown under the name: district, town, postcode */
  detail?: string
  /** the query had a house number but OpenStreetMap only knows the street */
  houseNumberMissing?: boolean
  /** typed or pasted coordinates, no API call */
  fromCoordinates?: boolean
}

/**
 * Coordinates typed or pasted by the user: "45.8131, 15.9775", "45,8131 15,9775" or a
 * Google Maps link (".../@45.8131,15.9775,17z", "?q=45.8,15.9", "!3d45.8!4d15.9").
 * Returns null when the text is not coordinates or they are out of range.
 */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const t = text.trim()
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/,
    /^(-?\d{1,2},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/,
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (!m) continue
    const lat = Number(m[1].replace(',', '.'))
    const lon = Number(m[2].replace(',', '.'))
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
  }
  return null
}

type NominatimRow = {
  display_name: string
  name?: string
  lat: string
  lon: string
  type?: string
  address?: Record<string, string>
}

/** Human-friendly label from a Nominatim result with address details. */
export function toResult(r: NominatimRow, query: string): GeocodeResult {
  const a = r.address ?? {}
  const town = a.city || a.town || a.village || a.municipality || a.county
  const district = a.suburb || a.city_district || a.quarter || a.neighbourhood
  const street = a.road || a.pedestrian || a.footway
  const name =
    street && a.house_number
      ? `${street} ${a.house_number}`
      : r.name && r.name !== street
        ? r.name
        : street || r.display_name.split(',')[0].trim()
  const detail = [district && district !== town ? district : '', town, a.postcode].filter(Boolean).join(', ')
  const wantedNumber = /\b\d+[a-zA-Z]?\b/.test(query.replace(/\b\d{5}\b/g, ''))
  return {
    name,
    address: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    detail,
    houseNumberMissing: wantedNumber && !a.house_number && !!street,
  }
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
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '8', 'accept-language': 'hr', addressdetails: '1' })
    if (onlyCroatia) params.set('countrycodes', 'hr')
    const res = await fetchFn(`${NOMINATIM_URL}?${params}`, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Nominatim je vratio ${res.status}`)
    const rows = (await res.json()) as NominatimRow[]
    // the same street often comes back as several OSM segments: keep one per name + place
    const seen = new Set<string>()
    return rows
      .map((r) => toResult(r, query))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
      .filter((r) => {
        const k = `${r.name}|${r.detail}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 5)
  }

  return function search(query: string, onlyCroatia = true, signal?: AbortSignal): Promise<GeocodeResult[]> {
    const q = query.trim()
    const coords = parseCoordinates(q)
    if (coords)
      return Promise.resolve([
        {
          name: `Točka ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
          address: `Koordinate ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
          ...coords,
          fromCoordinates: true,
        },
      ])
    if (q.length < 3) return Promise.resolve([])
    const p = queue.then(() => request(q, onlyCroatia, signal))
    queue = p.catch(() => undefined)
    return p
  }
}

export const geocode = createGeocoder()
