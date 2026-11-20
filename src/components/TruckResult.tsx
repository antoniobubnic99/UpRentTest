import { fmtHours, fmtKg, fmtKm } from '../format'
import type { Settings, TruckPlan } from '../solver'

interface Props {
  plan: TruckPlan
  color: string
  settings: Settings
}

const ACTION_LABEL = {
  start: 'Polazak',
  pickup: 'Preuzimanje',
  delivery: 'Isporuka',
  return: 'Povratak',
} as const

export function TruckResult({ plan, color, settings }: Props) {
  const { truck } = plan
  const limitOn = settings.timeLimitMode !== 'none'
  const overLimit = plan.totalHours > settings.maxHoursPerDay

  return (
    <div className="card truck">
      <div className="truck-head">
        <span className="swatch" style={{ background: color }} />
        <h3>{truck.name}</h3>
        <span className="muted">
          {fmtKg(truck.capacityKg)} · max {truck.maxItems} stroja
        </span>
      </div>

      <div className="kpis small">
        <div>
          <span>Kilometraža</span>
          <strong>{fmtKm(plan.totalKm)}</strong>
        </div>
        <div>
          <span>Izvršeni nalozi</span>
          <strong>{plan.ordersCompleted}</strong>
        </div>
        <div>
          <span>Vožnja</span>
          <strong>{fmtHours(plan.driveHours)}</strong>
        </div>
        <div>
          <span>Utovar / istovar</span>
          <strong>{fmtHours(plan.handlingHours)}</strong>
        </div>
        <div className={overLimit ? 'warn-text' : ''}>
          <span>Ukupno radno vrijeme</span>
          <strong>{fmtHours(plan.totalHours)}</strong>
        </div>
      </div>

      {plan.ordersCompleted === 0 ? (
        <p className="hint">Kamion ne dobiva nijedan nalog, jer optimalni raspored ne treba ovaj kamion.</p>
      ) : (
        <div className="table-wrap">
          <table className="steps">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Lokacija</th>
                <th>Radnja</th>
                <th>Nalog / stroj</th>
                <th className="r">Dionica</th>
                <th className="r">Ukupno</th>
                <th>Opterećenje nakon radnje</th>
                <th className="r">Vrijeme</th>
              </tr>
            </thead>
            <tbody>
              {plan.steps.map((s) => {
                const pct = Math.min(100, (s.loadKg / truck.capacityKg) * 100)
                return (
                  <tr key={s.seq} className={`act-${s.action}`}>
                    <td className="r muted">{s.seq}</td>
                    <td>
                      <strong>{s.locationId}</strong>
                    </td>
                    <td>
                      <span className={`badge badge-${s.action}`}>{ACTION_LABEL[s.action]}</span>
                    </td>
                    <td>{s.orderId ? `${s.orderId} · ${s.machineId}` : ''}</td>
                    <td className="r">{s.action === 'start' ? '' : fmtKm(s.legKm)}</td>
                    <td className="r">{fmtKm(s.cumulativeKm)}</td>
                    <td>
                      <div className="load">
                        <div className="load-bar">
                          <div style={{ width: `${pct}%` }} />
                        </div>
                        <span>
                          {fmtKg(s.loadKg)} · {s.loadCount}/{truck.maxItems}
                        </span>
                      </div>
                    </td>
                    <td className="r">{fmtHours(s.cumulativeHours)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {limitOn && (
        <p className="hint">
          Računato prema limitu: {fmtHours(plan.limitedHours)} od {settings.maxHoursPerDay} h.
        </p>
      )}
    </div>
  )
}
