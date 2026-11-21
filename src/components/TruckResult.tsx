import { fmtHours, fmtKg, fmtKm, fmtNum } from '../format'
import { tr } from '../i18n'
import { actionLabel } from '../labels'
import type { Settings, TruckPlan } from '../solver'

interface Props {
  plan: TruckPlan
  color: string
  settings: Settings
  selectedSeq?: number
  onPrint?: () => void
  /** Google Maps directions links (real-map mode only) */
  googleLinks?: string[]
}


export function TruckResult({ plan, color, settings, selectedSeq, onPrint, googleLinks }: Props) {
  const { truck } = plan
  const limitOn = settings.timeLimitMode !== 'none'
  const overLimit = limitOn && plan.limitedHours > settings.maxHoursPerDay + 1e-9

  return (
    <div className="card truck" id={`truck-${truck.id}`}>
      <div className="truck-head">
        <span className="swatch" style={{ background: color }} />
        <h3>{truck.name}</h3>
        <span className="muted">
          {fmtKg(truck.capacityKg)} · {tr('truck.maxMachines', { n: truck.maxItems })}
        </span>
        <span className="truck-actions">
          {googleLinks && googleLinks.length > 0 && plan.ordersCompleted > 0 && (
            <span className="gmaps">
              {googleLinks.map((url, i) => (
                <a
                  key={url}
                  className="btn-outline small"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tr('truck.gmapsTitle')}
                >
                  {googleLinks.length === 1 ? tr('truck.gmaps') : tr('truck.gmapsPart', { i: i + 1, n: googleLinks.length })}
                </a>
              ))}
            </span>
          )}
          {onPrint && plan.ordersCompleted > 0 && (
            <button className="btn-outline small" onClick={onPrint}>
              {tr('truck.print')}
            </button>
          )}
        </span>
      </div>

      <div className="kpis small">
        <div>
          <span>{tr('truck.km')}</span>
          <strong>{fmtKm(plan.totalKm)}</strong>
        </div>
        <div>
          <span>{tr('res.ordersDone')}</span>
          <strong>{plan.ordersCompleted}</strong>
        </div>
        <div>
          <span>{tr('truck.drive')}</span>
          <strong>{fmtHours(plan.driveHours)}</strong>
        </div>
        <div>
          <span>{tr('truck.handling')}</span>
          <strong>{fmtHours(plan.handlingHours)}</strong>
        </div>
        {plan.breakHours > 0 && (
          <div>
            <span>{tr('act.break')}</span>
            <strong>{fmtHours(plan.breakHours)}</strong>
          </div>
        )}
        <div className={overLimit ? 'warn-text' : ''}>
          <span>{tr('truck.total')}</span>
          <strong>{fmtHours(plan.totalHours)}</strong>
        </div>
      </div>

      {plan.ordersCompleted === 0 ? (
        <p className="hint">{tr('truck.idle')}</p>
      ) : (
        <div className="table-wrap">
          <table className="steps">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>{tr('truck.location')}</th>
                <th>{tr('truck.action')}</th>
                <th>{tr('truck.orderMachine')}</th>
                <th className="r">{tr('truck.leg')}</th>
                <th className="r" title={tr('truck.speedTitle')}>
                  {tr('truck.speed')}
                </th>
                <th className="r">{tr('truck.cumulative')}</th>
                <th>{tr('truck.load')}</th>
                <th className="r" title={tr('truck.timeTitle')}>
                  {tr('truck.time')}
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.steps.map((s) => {
                const pct = Math.min(100, (s.loadKg / truck.capacityKg) * 100)
                return (
                  <tr
                    key={s.seq}
                    id={`step-${truck.id}-${s.seq}`}
                    className={`act-${s.action}${selectedSeq === s.seq ? ' selected' : ''}`}
                  >
                    <td className="r muted c-seq">{s.seq}</td>
                    <td className="c-loc">
                      <strong>{s.locationId}</strong>
                    </td>
                    <td className="c-act">
                      <span className={`badge badge-${s.action}`}>{actionLabel(s.action)}</span>
                    </td>
                    <td className="c-ord">{s.orderId ? `${s.orderId} · ${s.machineId}` : ''}</td>
                    <td className="r c-leg" data-label={tr('truck.leg')}>
                      {s.action === 'start' || s.action === 'break' ? '' : fmtKm(s.legKm)}
                      {s.legHours > 0 && <small className="muted"> · {Math.round(s.legHours * 60)} min</small>}
                    </td>
                    <td className="r c-speed" data-label={tr('truck.speed')}>
                      {s.legKm > 0 && s.legHours > 0 ? `${fmtNum(s.legKm / s.legHours)} km/h` : ''}
                    </td>
                    <td className="r c-cum" data-label={tr('truck.cumulative')}>
                      {fmtKm(s.cumulativeKm)}
                    </td>
                    <td className="c-load">
                      <div className="load">
                        <div className="load-bar">
                          <div style={{ width: `${pct}%` }} />
                        </div>
                        <span>
                          {fmtKg(s.loadKg)} · {s.loadCount}/{truck.maxItems}
                        </span>
                      </div>
                    </td>
                    <td className="r c-time">
                      {s.action === 'start' || s.action === 'return' || s.departureHours === s.arrivalHours
                        ? fmtHours(s.arrivalHours)
                        : `${fmtHours(s.arrivalHours)} – ${fmtHours(s.departureHours)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {limitOn && (
        <p className="hint">
          {tr('truck.limitNote', { h: fmtHours(plan.limitedHours), max: settings.maxHoursPerDay })}
        </p>
      )}
    </div>
  )
}
