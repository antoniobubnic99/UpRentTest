import { useEffect, useRef, useState } from 'react'
import { truckColor } from '../colors'
import { fmtClock, fmtHours, fmtKg, fmtKm } from '../format'
import { tr } from '../i18n'
import type { Plan, RouteStep, Settings, TruckPlan } from '../solver'
import { actionLabel } from '../labels'

interface Props {
  plan: Plan
  settings: Settings
  visible: Set<string>
  selected: { truckId: string; seq: number } | null
  onSelect: (truckId: string, seq: number) => void
}

/** Day start assumed for clock times (same as the driver sheets). */
const DAY_START = 7

interface Segment {
  kind: 'drive' | 'pickup' | 'delivery' | 'break'
  from: number
  to: number
  /** step the segment belongs to (drive: the step it leads to) */
  step: RouteStep
  prev?: RouteStep
}

/** One vehicle's day as consecutive segments: drive, loading, unloading, break. */
function segments(tp: TruckPlan): Segment[] {
  const out: Segment[] = []
  tp.steps.forEach((s, i) => {
    const prev = tp.steps[i - 1]
    if (prev && s.arrivalHours > prev.departureHours + 1e-9)
      out.push({ kind: 'drive', from: prev.departureHours, to: s.arrivalHours, step: s, prev })
    if ((s.action === 'pickup' || s.action === 'delivery' || s.action === 'break') && s.departureHours > s.arrivalHours + 1e-9)
      out.push({ kind: s.action, from: s.arrivalHours, to: s.departureHours, step: s })
  })
  return out
}

/**
 * "Vremenska linija": one bar per vehicle on a common clock axis (day start 07:00).
 * The bar is the working day split into blocks: driving (grey, with km), loading (green),
 * unloading (blue) and the break (striped). Location ids are written in the blocks where
 * there is room; every block has a tooltip and selects its row in the route table.
 * The daily limit is a red line, time past it is shaded.
 */
export function Timeline({ plan, settings, visible, selected, onSelect }: Props) {
  const trucks = plan.trucks.map((tp, i) => ({ tp, color: truckColor(i) })).filter(({ tp }) => visible.has(tp.truck.id))
  const limitOn = settings.timeLimitMode !== 'none'
  const longest = Math.max(0, ...trucks.map(({ tp }) => tp.totalHours))
  const span = Math.max(1, Math.ceil(Math.max(longest, limitOn ? settings.maxHoursPerDay : 0)))
  const pct = (h: number) => `${(h / span) * 100}%`

  // Labels only where there is room, measured on the real bar width (phones vs desktop).
  const ref = useRef<HTMLDivElement>(null)
  const [barPx, setBarPx] = useState(700)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const bar = el.querySelector('.vl-bar') as HTMLElement | null
      if (bar) setBarPx(Math.max(1, bar.clientWidth))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [trucks.length])
  const pxPerHour = barPx / span
  const tickStep = pxPerHour < 46 ? 2 : 1
  const ticks = Array.from({ length: span + 1 }, (_, i) => i).filter((t) => t % tickStep === 0)
  const fits = (hours: number, px: number) => hours * pxPerHour >= px

  const tip = (sg: Segment): string => {
    const time = `${fmtClock(sg.from, DAY_START)}–${fmtClock(sg.to, DAY_START)} (${Math.round((sg.to - sg.from) * 60)} min)`
    if (sg.kind === 'drive') {
      const kmh = sg.step.legKm / (sg.to - sg.from)
      return tr('tl.tipDrive', {
        from: sg.prev!.locationId,
        to: sg.step.locationId,
        km: fmtKm(sg.step.legKm),
        time,
        kmh: Math.round(kmh),
      })
    }
    const s = sg.step
    return tr('tl.tipStop', {
      action: actionLabel(s.action),
      loc: s.locationId,
      order: s.orderId ? ` · ${s.orderId} (${s.machineId})` : '',
      time,
      load: fmtKg(s.loadKg),
    })
  }

  return (
    <div className="card timeline" ref={ref}>
      <div className="assign-head">
        <h3>{tr('tl.title')}</h3>
        <span className="muted small-text">{tr('tl.subtitle', { start: fmtClock(0, DAY_START) })}</span>
      </div>
      {trucks.length === 0 && <p className="hint">{tr('tl.noneSelected')}</p>}

      {trucks.length > 0 && (
        <div className="vl">
          <div className="vl-row vl-axis-row">
            <div />
            <div className="vl-axis">
              {ticks.map((t) => (
                <span key={t} className="vl-tick" style={{ left: pct(t) }}>
                  <strong>{fmtClock(t, DAY_START)}</strong>
                  <small>{t} h</small>
                </span>
              ))}
            </div>
          </div>

          {trucks.map(({ tp, color }) => {
            const over = limitOn && tp.limitedHours > settings.maxHoursPerDay + 1e-9
            const share = limitOn ? Math.round((tp.totalHours / settings.maxHoursPerDay) * 100) : null
            return (
              <div className="vl-row" key={tp.truck.id}>
                <div className="vl-label">
                  <span className="swatch" style={{ background: color }} />
                  <span>
                    <strong>{tp.truck.name}</strong>
                    <small className={over ? 'warn-text' : ''}>
                      {tp.ordersCompleted > 0
                        ? `${fmtHours(tp.totalHours)}${share !== null ? ` · ${share} %` : ''}`
                        : tr('res.noOrders')}
                    </small>
                    {tp.ordersCompleted > 0 && <small>{fmtKm(tp.totalKm)}</small>}
                  </span>
                </div>
                <div className="vl-bar" style={{ ['--truck' as string]: color }}>
                  {ticks.map((t) => (
                    <span key={t} className="vl-grid" style={{ left: pct(t) }} />
                  ))}
                  {limitOn && (
                    <>
                      <span className="vl-over" style={{ left: pct(settings.maxHoursPerDay) }} />
                      <span className="vl-limit" style={{ left: pct(settings.maxHoursPerDay) }} title={tr('tl.limit', { h: settings.maxHoursPerDay })} />
                    </>
                  )}
                  {tp.ordersCompleted === 0 && <span className="vl-idle">{tr('tl.idle')}</span>}
                  {tp.ordersCompleted > 0 && (
                    <div className="vl-day" style={{ width: pct(tp.totalHours) }}>
                      {segments(tp).map((sg, k) => {
                        const isSel = selected?.truckId === tp.truck.id && selected.seq === sg.step.seq
                        const label =
                          sg.kind === 'drive'
                            ? fits(sg.to - sg.from, 52)
                              ? fmtKm(sg.step.legKm)
                              : ''
                            : sg.kind === 'break'
                              ? fits(sg.to - sg.from, 40)
                                ? tr('act.break')
                                : ''
                              : fits(sg.to - sg.from, 22)
                                ? sg.step.locationId
                                : ''
                        return (
                          <button
                            key={k}
                            className={`vl-seg vl-${sg.kind}${isSel ? ' selected' : ''}`}
                            style={{ width: `${((sg.to - sg.from) / tp.totalHours) * 100}%` }}
                            title={tip(sg)}
                            aria-label={tip(sg)}
                            onClick={() => onSelect(tp.truck.id, sg.step.seq)}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="legend vl-legend">
        <span>
          <span className="vl-key vl-drive" /> {tr('tl.keyDrive')}
        </span>
        <span>
          <span className="vl-key vl-pickup" /> {tr('tl.keyPickup')}
        </span>
        <span>
          <span className="vl-key vl-delivery" /> {tr('tl.keyDelivery')}
        </span>
        <span>
          <span className="vl-key vl-break" /> {tr('act.break')}
        </span>
        {limitOn && (
          <span>
            <span className="vl-key vl-limit-key" /> {tr('tl.limit', { h: settings.maxHoursPerDay })}
          </span>
        )}
        <span className="muted">{tr('tl.help')}</span>
      </div>
    </div>
  )
}
