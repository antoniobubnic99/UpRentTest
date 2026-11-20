import L from 'leaflet'
import type { Location } from './solver'

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const ZAGREB: [number, number] = [45.815, 15.982]

export function hasLatLon(l: Location): l is Location & { lat: number; lon: number } {
  return Number.isFinite(l.lat) && Number.isFinite(l.lon)
}

/** Square base marker in the Up Rent style. */
export const baseIcon = L.divIcon({ className: 'geo-base', iconSize: [20, 20], iconAnchor: [10, 10] })

/** Round marker for a location that can be dragged. */
export const pointIcon = L.divIcon({ className: 'geo-point', iconSize: [16, 16], iconAnchor: [8, 8] })

/** Screen-space bearing (degrees, 0 = east, clockwise) between two points in Web Mercator. */
export function bearing(a: [number, number], b: [number, number]): number {
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const dx = b[1] - a[1]
  const dy = ((y(b[0]) - y(a[0])) * 180) / Math.PI
  return (Math.atan2(-dy, dx) * 180) / Math.PI
}

export function arrowIcon(color: string, deg: number) {
  return L.divIcon({
    className: 'geo-arrow',
    html: `<span style="transform: rotate(${deg}deg); border-left-color: ${color}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}
