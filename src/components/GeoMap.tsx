import 'leaflet/dist/leaflet.css'
import { useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { truckColor } from '../colors'
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

  return (
    <div className="card">
      <h3>Karta ruta</h3>
      <MapContainer className="geo-map" center={points[0] ?? ZAGREB} zoom={11} scrollWheelZoom={false}>
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
        <FitBounds points={points} />

        {plan.trucks.map((tp, ti) => {
          if (!visible.has(tp.truck.id)) return null
          const color = truckColor(ti)
          const path = tp.steps
            .map((s) => loc.get(s.locationId))
            .filter((l): l is Location & { lat: number; lon: number } => !!l)
            .map((l) => [l.lat, l.lon] as [number, number])
          const legs = path.slice(1).map((b, k) => [path[k], b] as const).filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1])
          return (
            <span key={tp.truck.id}>
              <Polyline positions={path} pathOptions={{ color: '#111', weight: 7, opacity: 0.8 }} />
              <Polyline positions={path} pathOptions={{ color, weight: 4, opacity: 1 }}>
                <Tooltip sticky>
                  {tp.truck.name}: {fmtKm(tp.totalKm)}, {tp.orderIds.join(', ') || 'bez naloga'}
                </Tooltip>
              </Polyline>
              {legs.map(([a, b], k) => (
                <Marker
                  key={k}
                  position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}
                  icon={arrowIcon(color, bearing(a, b))}
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
          Linije spajaju lokacije redom vožnje; km = zračna udaljenost × faktor ceste {input.settings.roadFactor}.
        </span>
      </div>
    </div>
  )
}
