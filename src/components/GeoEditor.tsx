import 'leaflet/dist/leaflet.css'
import type L from 'leaflet'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import { addLocation, moveLocation } from '../data/edit'
import { geocode, type GeocodeResult } from '../data/geocode'
import type { ProblemInput } from '../solver'
import { OSM_ATTRIBUTION, OSM_TILES, ZAGREB, baseIcon, hasLatLon, pointIcon } from '../geo'
import { FitBounds } from './FitBounds'

interface Props {
  input: ProblemInput
  onChange: (next: ProblemInput) => void
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

function ClickToAdd({ onAdd }: { onAdd: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onAdd(round(e.latlng.lat), round(e.latlng.lng)) })
  return null
}

/**
 * Entering real locations (F7): click on the map, search an address (Nominatim, max 1 req/s),
 * drag markers, or type coordinates in the table below. Manual entry always works,
 * even when the public map services are unavailable.
 */
export default function GeoEditor({ input, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [onlyHr, setOnlyHr] = useState(true)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [error, setError] = useState('')
  const tooShort = query.trim().length < 3

  // Debounced search; the geocoder itself also enforces at most 1 request per second.
  useEffect(() => {
    if (tooShort) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setStatus('loading')
      geocode(query, onlyHr, ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return
          setResults(r)
          setStatus(r.length ? 'idle' : 'empty')
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return
          setStatus('error')
          setError(e instanceof Error ? e.message : String(e))
        })
    }, 600)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, onlyHr, tooShort])

  const pick = (r: GeocodeResult) => {
    // keep what the user typed (e.g. "Horvatova ulica 13") when OSM only knows the street
    const name = r.houseNumberMissing ? query.trim() : r.name
    const address = r.houseNumberMissing ? `${query.trim()} (približno: ${r.address})` : r.address
    onChange(addLocation(input, { name, lat: round(r.lat), lon: round(r.lon), address }))
    setQuery('')
    setResults([])
    setStatus('idle')
  }

  const located = input.locations.filter(hasLatLon)
  const points = located.map((l) => [l.lat, l.lon] as [number, number])

  return (
    <div className="geo-editor">
      <div className="geo-search">
        <input
          className="cell-input text"
          type="search"
          placeholder="Adresa, mjesto ili koordinate / Google Maps link"
          aria-label="Traži adresu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="toggle small">
          <input type="checkbox" checked={onlyHr} onChange={(e) => setOnlyHr(e.target.checked)} /> samo HR
        </label>
        {!tooShort && (results.length > 0 || status !== 'idle') && (
          <ul className="geo-results" role="listbox">
            {status === 'loading' && <li className="muted">Tražim…</li>}
            {status === 'empty' && <li className="muted">Nema rezultata.</li>}
            {status === 'error' && (
              <li className="warn-text">
                Pretraga trenutno ne radi ({error}). Klikni na kartu ili upiši koordinate ručno.
              </li>
            )}
            {results.map((r) => (
              <li key={`${r.lat},${r.lon},${r.address}`}>
                <button onClick={() => pick(r)} title={r.address}>
                  <strong>{r.name}</strong>
                  <small>{r.fromCoordinates ? r.address : r.detail || r.address}</small>
                  {r.houseNumberMissing && (
                    <small className="warn-text">
                      Kućni broj nije u OpenStreetMap podacima: marker će biti na ulici, povuci ga na točno mjesto.
                    </small>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MapContainer className="geo-editor-map" center={points[0] ?? ZAGREB} zoom={9} scrollWheelZoom>
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
        <FitBounds points={points} />
        <ClickToAdd onAdd={(lat, lon) => onChange(addLocation(input, { lat, lon }))} />
        {located.map((l) =>
          l.id === input.baseId ? (
            <Marker
              key={l.id}
              position={[l.lat, l.lon]}
              icon={baseIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = (e.target as L.Marker).getLatLng()
                  onChange(moveLocation(input, l.id, round(p.lat), round(p.lng)))
                },
              }}
            >
              <Tooltip permanent direction="right" offset={[10, 0]} className="geo-label">
                {l.id}
              </Tooltip>
            </Marker>
          ) : (
            <Marker
              key={l.id}
              position={[l.lat, l.lon]}
              icon={pointIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = (e.target as L.Marker).getLatLng()
                  onChange(moveLocation(input, l.id, round(p.lat), round(p.lng)))
                },
              }}
            >
              <Tooltip permanent direction="right" offset={[8, 0]} className="geo-label">
                {l.id}
              </Tooltip>
            </Marker>
          ),
        )}
      </MapContainer>
      <p className="hint">
        Klik na kartu dodaje lokaciju, a marker se može povući mišem. Pretraga: Nominatim / OpenStreetMap (najviše 1 upit u
        sekundi). Kućni brojevi postoje samo gdje su upisani u OpenStreetMap; za točnu lokaciju zalijepi koordinate ili link
        iz Google karata (desni klik na mjesto → kopiraj koordinate).
      </p>
    </div>
  )
}
