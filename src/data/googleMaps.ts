/**
 * "Open in Google Maps" links for a vehicle's route (Google Maps URLs, no API key).
 * A directions URL takes an origin, a destination and at most 9 waypoints, so longer
 * routes are split into consecutive parts; each part starts where the previous one ended.
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */

export const MAX_WAYPOINTS = 9

const fmt = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`

export function googleMapsRouteUrls(stops: { lat: number; lon: number }[]): string[] {
  // consecutive actions at the same place are one stop
  const pts = stops.filter((p, i) => i === 0 || p.lat !== stops[i - 1].lat || p.lon !== stops[i - 1].lon)
  if (pts.length < 2) return []
  const perPart = MAX_WAYPOINTS + 2
  const urls: string[] = []
  for (let start = 0; start < pts.length - 1; start += perPart - 1) {
    const part = pts.slice(start, start + perPart)
    const params = new URLSearchParams({
      api: '1',
      origin: fmt(part[0]),
      destination: fmt(part[part.length - 1]),
      travelmode: 'driving',
    })
    const waypoints = part.slice(1, -1)
    if (waypoints.length) params.set('waypoints', waypoints.map(fmt).join('|'))
    urls.push(`https://www.google.com/maps/dir/?${params}`)
  }
  return urls
}
