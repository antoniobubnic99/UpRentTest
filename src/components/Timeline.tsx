import { useEffect, useRef, useState } from 'react'
import { truckColor } from '../colors'
import { fmtHours, fmtKm } from '../format'
import type { Plan, RouteStep, Settings } from '../solver'

interface Props {
  plan: Plan
  settings: Settings
  visible: Set<string>
  selected: { truckId: string; seq: number } | null
  onSelect: (truckId: string, seq: number) => void
}

const ACTION: Record<RouteStep['action'], string> = {
  start: 'Polazak',
  pickup: 'Preuzimanje',
  delivery: 'Isporuka',
  break: 'Pauza',
  return: 'Povratak',
}

function minutes(h: number): string {
  return `${Math.round(h * 60)} min`
}

/**
 * Time line (requirement 8 / Q6): one row per vehicle on a common 0..N h axis.
 * Drive legs are lines whose length equals the driving time (labelled km / min),
 * loading, unloading and the break are coloured blocks, dots mark arrivals at locations.
 */
export function Timeline({ plan, settings, visible, selected, onSelect }: Props) {
  const trucks = plan.trucks.map((tp, i) => ({ tp, color: truckColor(i) })).filter(({ tp }) => visible.has(tp.truck.id))
  const longest = Math.max(0, ...trucks.map(({ tp }) => tp.totalHours))
  const limitOn = settings.timeLimitMode !== 'none'
  const span = Math.max(1, Math.ceil(Math.max(longest, limitOn ? settings.maxHoursPerDay : 0)))
  const pct = (h: number) => `${(h / span) * 100}%`
  // Labels only where there is room for them, measured in pixels of the actual track
  // (narrow on phones, wide on desktop); details are always in the tooltip.
  const hasRows = trucks.length > 0
  const gridRef = useRef<HTMLDivElement>(null)
  const [trackPx, setTrackPx] = useState(700)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const track = el.querySelector('.tl-row .tl-track') as HTMLElement | null
      if (track) setTrackPx(Math.max(1, track.clientWidth))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasRows])
  const pxPerHour = trackPx / span
  const tickStep = pxPerHour < 34 ? 2 : 1
  const ticks = Array.from({ length: span + 1 }, (_, i) => i).filter(
    (t) => t % tickStep === 0 || (t === span && (span % tickStep) * pxPerHour >= 34),
  )
  const LEG_LABEL_MIN = 78 / trackPx
  const POINT_LABEL_GAP = 24 / trackPx

  return (
    <div className="card timeline">
      <h3>Linija vremena</h3>
      {trucks.length === 0 && <p className="hint">Nijedno vozilo nije odabrano.</p>}
      {trucks.length > 0 && (
        <div className="tl-grid" ref={gridRef}>
          <div className="tl-axis-row">
            <div className="tl-label" />
            <div className="tl-track tl-axis">
              {ticks.map((t) => (
                <span key={t} className="tl-tick" style={{ left: pct(t) }}>
                  {t} h
                </span>
              ))}
            </div>
          </div>

          {trucks.map(({ tp, color }) => (
            <div className="tl-row" key={tp.truck.id}>
              <div className="tl-label">
                <span className="swatch" style={{ background: color }} />
                <span>
                  <strong>{tp.truck.name}</strong>
                  <small>
                    {fmtKm(tp.totalKm)} · {fmtHours(tp.totalHours)}
                  </small>
                </span>
              </div>
              <div className="tl-track">
                {ticks.map((t) => (
                  <span key={t} className="tl-gridline" style={{ left: pct(t) }} />
                ))}
                {limitOn && (
                  <span
                    className="tl-limit"
                    style={{ left: pct(settings.maxHoursPerDay) }}
                    title={`Dnevni limit ${settings.maxHoursPerDay} h`}
                  />
                )}
                {tp.ordersCompleted === 0 && <span className="tl-idle">bez naloga</span>}

                {tp.ordersCompleted > 0 &&
                  (() => {
                    let lastLabelAt = -Infinity
                    return tp.steps.map((s, i) => {
                    const prev = tp.steps[i - 1]
                    const isSel = selected?.truckId === tp.truck.id && selected.seq === s.seq
                    const parts = []
                    if (prev && s.arrivalHours > prev.departureHours + 1e-9) {
                      const dur = s.arrivalHours - prev.departureHours
                      parts.push(
                        <div
                          key={`d${i}`}
                          className="tl-drive"
                          style={{ left: pct(prev.departureHours), width: pct(dur), background: color }}
                          title={`${prev.locationId} → ${s.locationId}: ${fmtKm(s.legKm)}, ${minutes(dur)} vožnje`}
                        >
                          {dur / span >= LEG_LABEL_MIN && (
                            <span className="tl-drive-label">
                              {fmtKm(s.legKm)} / {Math.round(dur * 60)}′
                            </span>
                          )}
                        </div>,
                      )
                    }
                    if (s.departureHours > s.arrivalHours + 1e-9) {
                      parts.push(
                        <div
                          key={`h${i}`}
                          className={`tl-block tl-${s.action}`}
                          style={{ left: pct(s.arrivalHours), width: pct(s.departureHours - s.arrivalHours) }}
                          title={`${ACTION[s.action]}${s.orderId ? ` ${s.orderId} (${s.machineId})` : ''} na ${s.locationId}: ${fmtHours(s.arrivalHours)} – ${fmtHours(s.departureHours)} (${minutes(s.departureHours - s.arrivalHours)})`}
                        />,
                      )
                    }
                    if (s.action !== 'break') {
                      const prevSame = prev && prev.locationId === s.locationId && prev.action !== 'start'
                      const showLabel = !prevSame && (s.arrivalHours - lastLabelAt) / span >= POINT_LABEL_GAP
                      if (showLabel) lastLabelAt = s.arrivalHours
                      parts.push(
                        <button
                          key={`p${i}`}
                          className={`tl-point ${isSel ? 'selected' : ''}`}
                          style={{ left: pct(s.arrivalHours) }}
                          onClick={() => onSelect(tp.truck.id, s.seq)}
                          aria-label={`${tp.truck.name}, korak ${s.seq}: ${ACTION[s.action]} ${s.locationId}`}
                          title={`${ACTION[s.action]} ${s.locationId}${s.orderId ? ` · ${s.orderId}` : ''} · dolazak ${fmtHours(s.arrivalHours)} · ukupno ${fmtKm(s.cumulativeKm)} · teret ${s.loadKg.toLocaleString('hr-HR')} kg`}
                        >
                          {showLabel && <span className="tl-point-label">{s.locationId}</span>}
                        </button>,
                      )
                    }
                    return parts
                    })
                  })()}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="legend tl-legend">
        <span>
          <span className="tl-key tl-pickup" /> Utovar
        </span>
        <span>
          <span className="tl-key tl-delivery" /> Istovar
        </span>
        <span>
          <span className="tl-key tl-break" /> Pauza
        </span>
        <span>
          <span className="tl-key tl-drive-key" /> Vožnja (km / min)
        </span>
        {limitOn && (
          <span>
            <span className="tl-key tl-limit-key" /> Limit {settings.maxHoursPerDay} h
          </span>
        )}
        <span className="muted">Klik na točku označava korak u tablici; prijeđi mišem (ili dodirni) za detalje.</span>
      </div>
    </div>
  )
}
