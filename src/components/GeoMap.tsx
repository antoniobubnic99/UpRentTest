import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { truckColor } from '../colors'
import { arrowPoints, fetchRouteGeometry } from '../data/routing'
import { fmtKm } from '../format'
import { OSM_ATTRIBUTION, OSM_TILES, ZAGREB, arrowIcon, baseIcon, bearing, hasLatLon } from '../geo'
import type { Location, Plan, ProblemInput } from '../solver'
import { FitBounds } from './FitBounds'

interface Props {
  input: ProblemInput
  plan: Plan
  visible: Set<string>
}

/** Real map (OpenStreetMap) with the routes of the selected vehicles (F6). */
export default function GeoMap({ input, plan, visible }: Props) {
  const loc = useMemo(() => new Map(input.locations.filter(hasLatLon).map((l) => [l.id, l])), [input])
  const points = [...loc.values()].map((l) => [l.lat, l.lon] as [number, number])

  // Stops of every truck in visiting order.
  const paths = useMemo(
    () =>
      plan.trucks.map((tp) =>
        tp.steps
          .map((s) => loc.get(s.locationId))
          .filter((l): l is Location & { lat: number; lon: number } => !!l)
          .map((l) => [l.lat, l.lon] as [number, number]),
      ),
    [plan, loc],
  )

  // Road geometry per truck from OSRM; straight lines while loading or if the service fails.
  const pathsKey = JSON.stringify(paths)
  const [roads, setRoads] = useState<{ key: string; lines: ([number, number][] | null)[]; failed: boolean } | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    const list = JSON.parse(pathsKey) as [number, number][][]
    Promise.allSettled(list.map((p) => (p.length > 1 ? fetchRouteGeometry(p, undefined, ctrl.signal) : Promise.resolve(p)))).then(
      (res) => {
        if (ctrl.signal.aborted) return
        setRoads({
          key: pathsKey,
          lines: res.map((r) => (r.status === 'fulfilled' ? r.value : null)),
          failed: res.some((r) => r.status === 'rejected'),
        })
      },
    )
    return () => ctrl.abort()
  }, [pathsKey])
  const roadLines = roads?.key === pathsKey ? roads : null

  return (
    <div className="card">
      <h3>Karta ruta</h3>
      <MapContainer className="geo-map" center={points[0] ?? ZAGREB} zoom={11} scrollWheelZoom={false}>
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
        <FitBounds points={points} />

        {plan.trucks.map((tp, ti) => {
          if (!visible.has(tp.truck.id)) return null
          const color = truckColor(ti)
          const path = paths[ti]
          const road = roadLines?.lines[ti] ?? null
          const line = road ?? path
          const arrows: { at: [number, number]; next: [number, number]; from: [number, number] }[] = road
            ? arrowPoints(road, 6).map((ar) => ({ ...ar, from: ar.at }))
            : path
                .slice(1)
                .map((b, k) => ({ a: path[k], b }))
                .filter(({ a, b }) => a[0] !== b[0] || a[1] !== b[1])
                .map(({ a, b }) => ({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number], next: b, from: a }))
          return (
            <span key={tp.truck.id}>
              <Polyline positions={line} pathOptions={{ color: '#111', weight: 7, opacity: 0.8, dashArray: road ? undefined : '2 8' }} />
              <Polyline positions={line} pathOptions={{ color, weight: 4, opacity: 1 }}>
                <Tooltip sticky>
                  {tp.truck.name}: {fmtKm(tp.totalKm)}, {tp.orderIds.join(', ') || 'bez naloga'}
                </Tooltip>
              </Polyline>
              {arrows.map((ar, k) => (
                <Marker
                  key={k}
                  position={ar.at}
                  icon={arrowIcon(color, bearing(ar.from, ar.next))}
                  interactive={false}
                />
              ))}
            </span>
          )
        })}

        {[...loc.values()].map((l) =>
          l.id === input.baseId ? (
            <Marker key={l.id} position={[l.lat, l.lon]} icon={baseIcon}>
              <Tooltip permanent direction="right" offset={[10, 0]} className="geo-label">
                {l.id} · {l.name}
              </Tooltip>
            </Marker>
          ) : (
            <CircleMarker
              key={l.id}
              center={[l.lat, l.lon]}
              radius={7}
              pathOptions={{ color: '#000', weight: 2.5, fillColor: '#fff', fillOpacity: 1 }}
            >
              <Tooltip permanent direction="right" offset={[8, 0]} className="geo-label">
                {l.id}
                {l.name && l.name !== l.id ? ` · ${l.name}` : ''}
              </Tooltip>
            </CircleMarker>
          ),
        )}
      </MapContainer>
      <div className="legend">
        {plan.trucks.map((tp, i) => (
          <span key={tp.truck.id} className={visible.has(tp.truck.id) ? '' : 'off'}>
            <span className="swatch" style={{ background: truckColor(i) }} /> {tp.truck.name}
          </span>
        ))}
        <span>
          <span className="swatch base" /> Baza {input.baseId}
        </span>
        <span className="muted">
          {!roadLines
            ? 'Učitavam cestovne rute…'
            : roadLines.failed
              ? 'Servis za rute nije dostupan: prikazane su ravne linije između lokacija.'
              : 'Rute po cestama (OpenStreetMap, OSRM).'}{' '}
          {plan.distanceUsed === 'road'
            ? 'Km u planu su cestovne udaljenosti.'
            : `Km u planu: zračna udaljenost × faktor ${input.settings.roadFactor}.`}
        </span>
      </div>
    </div>
  )
}
