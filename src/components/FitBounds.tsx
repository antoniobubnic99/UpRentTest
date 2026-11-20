import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/** Fits the map to the given points whenever the set of points changes. */
export function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join(';')
  useEffect(() => {
    const pts = key ? key.split(';').map((s) => s.split(',').map(Number) as [number, number]) : []
    if (pts.length === 0) return
    if (pts.length === 1) map.setView(pts[0], 12)
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] })
  }, [key, map])
  return null
}
