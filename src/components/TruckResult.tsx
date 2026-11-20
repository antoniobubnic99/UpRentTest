import { fmtHours, fmtKg, fmtKm } from '../format'
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

const ACTION_LABEL = {
  start: 'Polazak',
  pickup: 'Preuzimanje',
  delivery: 'Isporuka',
  break: 'Pauza',
  return: 'Povratak',
} as const

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
          {fmtKg(truck.capacityKg)} · max {truck.maxItems} stroja
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
                  title="Otvara rutu s redoslijedom stanica u Google kartama (nova kartica)"
                >
                  {googleLinks.length === 1 ? 'Otvori u Google kartama' : `Google karte ${i + 1}/${googleLinks.length}`}
                </a>
              ))}
            </span>
          )}
          {onPrint && plan.ordersCompleted > 0 && (
            <button className="btn-outline small" onClick={onPrint}>
              Ispis za vozača
            </button>
          )}
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
        {plan.breakHours > 0 && (
          <div>
            <span>Pauza</span>
            <strong>{fmtHours(plan.breakHours)}</strong>
          </div>
        )}
        <div className={overLimit ? 'warn-text' : ''}>
          <span>Ukupno radno vrijeme</span>
          <strong>{fmtHours(plan.totalHours)}</strong>
        </div>
      </div>

      {plan.ordersCompleted === 0 ? (
        <p className="hint">Kamion ne dobiva nijedan nalog: raspored ne treba ovo vozilo.</p>
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
                <th className="r" title="Dolazak – odlazak (od početka radnog dana)">Dolazak – odlazak</th>
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
                      <span className={`badge badge-${s.action}`}>{ACTION_LABEL[s.action]}</span>
                    </td>
                    <td className="c-ord">{s.orderId ? `${s.orderId} · ${s.machineId}` : ''}</td>
                    <td className="r c-leg" data-label="dionica">
                      {s.action === 'start' || s.action === 'break' ? '' : fmtKm(s.legKm)}
                    </td>
                    <td className="r c-cum" data-label="ukupno">
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
          Računato prema limitu: {fmtHours(plan.limitedHours)} od {settings.maxHoursPerDay} h.
        </p>
      )}
    </div>
  )
}
