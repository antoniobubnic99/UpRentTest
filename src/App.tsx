import { useMemo, useState } from 'react'
import { InputTables } from './components/InputTables'
import { RouteMap } from './components/RouteMap'
import { SettingsPanel } from './components/SettingsPanel'
import { TruckResult } from './components/TruckResult'
import { cloneDefaultInput, emptyInput, isEmptyInput } from './data/defaultData'
import { clearAll } from './data/edit'
import { fmtKm } from './format'
import { InputError, solve, validatePlan, type Plan, type ProblemInput } from './solver'

// Truck colours in the Up Rent palette: signal yellow and graphite.
const TRUCK_COLORS = ['#FFFF00', '#4B5563', '#F59E0B', '#9CA3AF']

type Result =
  | { kind: 'ok'; plan: Plan; violations: string[]; input: ProblemInput }
  | { kind: 'error'; problems: string[] }
  | { kind: 'none' }

function run(input: ProblemInput): Result {
  try {
    const plan = solve(input)
    return { kind: 'ok', plan, violations: validatePlan(input, plan), input }
  } catch (e) {
    if (e instanceof InputError) return { kind: 'error', problems: e.problems }
    return { kind: 'error', problems: [String(e)] }
  }
}

export default function App() {
  // Requirement 3: start empty; "Vrati podatke iz zadatka" fills in the task data.
  const [input, setInput] = useState<ProblemInput>(() => emptyInput())
  const [result, setResult] = useState<Result>({ kind: 'none' })
  const empty = isEmptyInput(input)
  const [showInputs, setShowInputs] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  const stale = result.kind === 'ok' && result.input !== input
  const optimise = () => setResult(run(input))
  const reset = () => {
    const fresh = cloneDefaultInput()
    setInput(fresh)
    setResult(run(fresh))
    setConfirmClear(false)
  }
  const clear = () => {
    setInput(clearAll(input))
    setResult({ kind: 'none' })
    setConfirmClear(false)
  }

  const machineWeight = useMemo(() => new Map(input.machines.map((m) => [m.id, m.weightKg])), [input])

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <span className="brand-mark">UP RENT</span>
            <span className="brand-sub">Smart Logistics Planner</span>
          </div>
          <span className="topbar-meta">Planiranje prijevoza radnih strojeva</span>
        </div>
      </header>

      <main className="container">
        <section>
          <div className="section-head">
            <h2>Ulazni podaci</h2>
            <div className="actions">
              <button className="btn-link" onClick={() => setShowInputs((v) => !v)}>
                {showInputs ? 'Sakrij' : 'Prikaži'}
              </button>
              <button className="btn-secondary" disabled={empty} onClick={() => setConfirmClear(true)}>
                Obriši sve
              </button>
              <button className="btn-secondary" onClick={reset}>
                Vrati podatke iz zadatka
              </button>
            </div>
          </div>
          {confirmClear && (
            <div className="confirm-bar confirm-warn" role="alert">
              <span>
                Obrisati sva vozila ({input.trucks.length}), lokacije ({input.locations.length}) i naloge (
                {input.orders.length})? Postavke ostaju.
              </span>
              <span className="confirm-actions">
                <button className="btn-danger" onClick={clear}>
                  Obriši sve
                </button>
                <button className="btn-link" onClick={() => setConfirmClear(false)}>
                  Odustani
                </button>
              </span>
            </div>
          )}
          {showInputs && <InputTables input={input} onChange={setInput} />}
        </section>

        <section>
          <div className="section-head">
            <h2>Postavke</h2>
          </div>
          <SettingsPanel
            settings={input.settings}
            orderCount={input.orders.length}
            coordinateMode={input.coordinateMode}
            onChange={(settings) => setInput({ ...input, settings })}
          />
          <div className="run-bar">
            <button className="btn-primary" onClick={optimise}>
              Optimiziraj raspored
            </button>
            {stale && <span className="stale">Podaci su promijenjeni. Pokreni optimizaciju ponovno.</span>}
          </div>
        </section>

        {empty && result.kind === 'none' && (
          <div className="card empty-state">
            <h3>Još nema podataka za planiranje</h3>
            <p className="muted">
              Dodaj vozila, lokacije i naloge ili učitaj primjer iz zadatka (2 kamiona, 10 lokacija, 10 naloga).
            </p>
            <button className="btn-primary" onClick={reset}>
              Vrati podatke iz zadatka
            </button>
          </div>
        )}

        {result.kind === 'error' && (
          <div className="alert alert-error">
            <strong>Ulazni podaci nisu ispravni:</strong>
            <ul>
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {result.kind === 'ok' && (
          <section>
            <div className="section-head">
              <h2>Rezultat</h2>
            </div>

            <div className="kpis">
              <div className="kpi-main">
                <span>Ukupna kilometraža</span>
                <strong>{fmtKm(result.plan.totalKm)}</strong>
              </div>
              <div>
                <span>Izvršeni nalozi</span>
                <strong>
                  {result.plan.ordersCompleted} / {result.input.orders.length}
                </strong>
              </div>
              {result.plan.trucks.map((tp) => (
                <div key={tp.truck.id}>
                  <span>{tp.truck.name}</span>
                  <strong>{fmtKm(tp.totalKm)}</strong>
                </div>
              ))}
              <div>
                <span>Provjera ograničenja</span>
                <strong className={result.violations.length ? 'bad' : 'good'}>
                  {result.violations.length ? `${result.violations.length} kršenja` : 'Sve OK'}
                </strong>
              </div>
              <div>
                <span>Solver</span>
                <strong title={result.plan.solverUsed === 'exact' ? 'Dokazivo optimalan raspored' : 'Heuristika: bez jamstva optimuma'}>
                  {result.plan.solverUsed === 'exact' ? 'Egzaktni' : 'Heuristika'}
                </strong>
              </div>
              <div>
                <span>Vrijeme izračuna</span>
                <strong>{Math.max(1, Math.round(result.plan.solveMs))} ms</strong>
              </div>
            </div>

            {result.plan.solverUsed === 'heuristic' && (
              <div className="alert alert-info">
                Raspored je izračunala <strong>heuristika</strong> ({result.input.orders.length} naloga). Rezultat je
                valjan prema svim pravilima, ali nema jamstva da je najkraći mogući. Za ≤ 12 naloga koristi se egzaktni
                solver.
              </div>
            )}

            {result.plan.unassigned.length > 0 && (
              <div className="alert alert-warn">
                <strong>
                  Upozorenje: {result.plan.unassigned.length}{' '}
                  {result.plan.unassigned.length === 1 ? 'nalog nije moguće izvršiti' : 'naloga nije moguće izvršiti'}
                </strong>
                <ul>
                  {result.plan.unassigned.map((u) => {
                    const o = result.input.orders.find((x) => x.id === u.orderId)!
                    return (
                      <li key={u.orderId}>
                        <strong>{u.orderId}</strong> ({o.machineId}, {o.pickupId} → {o.deliveryId}): {u.reason}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {result.violations.length > 0 && (
              <div className="alert alert-error">
                <strong>Validator je pronašao kršenja pravila:</strong>
                <ul>
                  {result.violations.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="assignment card">
              <h3>Raspodjela naloga</h3>
              <div className="assign-rows">
                {result.plan.trucks.map((tp, i) => (
                  <div key={tp.truck.id} className="assign-row">
                    <span className="assign-truck">
                      <span className="swatch" style={{ background: TRUCK_COLORS[i] }} /> {tp.truck.name}
                    </span>
                    <span className="chips">
                      {tp.orderIds.length === 0 && <span className="muted">bez naloga</span>}
                      {tp.orderIds.map((id) => {
                        const o = result.input.orders.find((x) => x.id === id)!
                        return (
                          <span key={id} className="chip" title={`${o.pickupId} → ${o.deliveryId}`}>
                            {id} <small>{(machineWeight.get(o.machineId) ?? 0) / 1000} t</small>
                          </span>
                        )
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <RouteMap input={result.input} plan={result.plan} colors={TRUCK_COLORS} />

            {result.plan.trucks.map((tp, i) => (
              <TruckResult key={tp.truck.id} plan={tp} color={TRUCK_COLORS[i]} settings={result.input.settings} />
            ))}
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          Egzaktni solver (dinamičko programiranje) do 12 naloga, iznad toga heuristika · udaljenosti su zaokružene na
          0,1 km po dionici · prototip za Up Rent
        </div>
      </footer>
    </>
  )
}
