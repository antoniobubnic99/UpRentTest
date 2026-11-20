import { useState } from 'react'
import { truckColor } from '../colors'
import { fmtHours, fmtKm } from '../format'
import type { ProblemInput, Settings } from '../solver'
import { compareScenarios, currentScenario, type Scenario } from '../solver/scenarios'

interface Props {
  input: ProblemInput
  onApply: (settings: Settings) => void
}

/** Same data, three interpretations of the working day, side by side with explanations. */
export function ScenarioCompare({ input, onApply }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forInput, setForInput] = useState<ProblemInput | null>(null)
  const current = currentScenario(input.settings)
  const shown = forInput === input ? scenarios : null

  const run = () => {
    setBusy(true)
    setError('')
    // let the "Računam…" state paint before the (synchronous) solver runs
    setTimeout(() => {
      try {
        setScenarios(compareScenarios(input))
        setForInput(input)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    }, 20)
  }

  return (
    <div className="card scenarios">
      <div className="assign-head">
        <h3>Usporedba scenarija</h3>
        <button className="btn-secondary" onClick={run} disabled={busy}>
          {busy ? 'Računam…' : shown ? 'Izračunaj ponovno' : 'Usporedi scenarije'}
        </button>
      </div>
      {!shown && !busy && (
        <p className="hint">
          Isti podaci, tri tumačenja radnog dana: bez limita, limit {input.settings.maxHoursPerDay} h i limit uz obaveznu
          pauzu. Pokazuje koliko km „košta” svako ograničenje i zašto se raspored mijenja.
        </p>
      )}
      {error && <p className="hint warn-text">{error}</p>}
      {shown && (
        <div className="scenario-grid">
          {shown.map((s) => (
            <div key={s.key} className={`scenario ${s.key === current ? 'current' : ''}`}>
              <div className="scenario-head">
                <span className="scenario-label">{s.label}</span>
                {s.key === current && <span className="tag">trenutne postavke</span>}
              </div>
              <div className="scenario-km">
                <strong>{fmtKm(s.plan.totalKm)}</strong>
                {s.deltaKm !== null && s.deltaKm !== 0 && (
                  <span className="delta">
                    {s.deltaKm > 0 ? '+' : ''}
                    {fmtKm(s.deltaKm)}
                  </span>
                )}
              </div>
              <div className="scenario-meta">
                {s.plan.ordersCompleted}/{input.orders.length} naloga ·{' '}
                <span className={s.violations.length ? 'bad' : 'good'}>
                  {s.violations.length ? `${s.violations.length} kršenja` : 'Sve OK'}
                </span>
                {s.plan.solverUsed === 'heuristic' && ' · heuristika'}
              </div>
              <ul className="scenario-trucks">
                {s.plan.trucks.map((tp, i) => (
                  <li key={tp.truck.id}>
                    <span className="swatch" style={{ background: truckColor(i) }} />
                    <span className="name">{tp.truck.name}</span>
                    <span>
                      {tp.ordersCompleted ? `${fmtKm(tp.totalKm)} · ${fmtHours(tp.totalHours)}` : 'bez naloga'}
                    </span>
                    <small className="muted">{tp.orderIds.join(', ')}</small>
                  </li>
                ))}
              </ul>
              <ul className="scenario-why">
                {s.explanation.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              {s.key !== current && (
                <button className="btn-link" onClick={() => onApply(s.settings)}>
                  Primijeni ovaj scenarij
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
