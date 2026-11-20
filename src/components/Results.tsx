import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import type { Result } from '../App'
import { truckColor } from '../colors'
import { fmtKm } from '../format'
import type { Settings } from '../solver'
import { DriverSheets } from './DriverSheets'
import { RouteMap } from './RouteMap'
import { ScenarioCompare } from './ScenarioCompare'
import { Timeline } from './Timeline'
import { TruckResult } from './TruckResult'

// Leaflet is loaded only when a real map is shown.
const GeoMap = lazy(() => import('./GeoMap'))

interface Props {
  result: Extract<Result, { kind: 'ok' }>
  stale: boolean
  onApplySettings: (settings: Settings) => void
}

export function Results({ result, stale, onApplySettings }: Props) {
  const { plan, input, violations } = result
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<{ truckId: string; seq: number } | null>(null)
  const visible = useMemo(
    () => new Set(plan.trucks.map((t) => t.truck.id).filter((id) => !hidden.has(id))),
    [plan, hidden],
  )
  const [printIds, setPrintIds] = useState<string[] | null>(null)
  const donePrinting = useCallback(() => setPrintIds(null), [])
  const machineWeight = useMemo(() => new Map(input.machines.map((m) => [m.id, m.weightKg])), [input])

  const toggle = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHidden(next)
  }
  const select = (truckId: string, seq: number) => {
    setSelected({ truckId, seq })
    requestAnimationFrame(() =>
      document.getElementById(`step-${truckId}-${seq}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    )
  }

  return (
    <section className={stale ? 'is-stale' : ''}>
      <div className="section-head">
        <h2>Rezultat</h2>
        {stale && <span className="stale">Prikazan je rezultat za prethodne podatke.</span>}
      </div>

      <div className="kpis">
        <div className="kpi-main">
          <span>Ukupna kilometraža</span>
          <strong>{fmtKm(plan.totalKm)}</strong>
        </div>
        <div>
          <span>Izvršeni nalozi</span>
          <strong>
            {plan.ordersCompleted} / {input.orders.length}
          </strong>
        </div>
        <div>
          <span>Vozila u upotrebi</span>
          <strong>
            {plan.trucks.filter((t) => t.ordersCompleted > 0).length} / {plan.trucks.length}
          </strong>
        </div>
        <div>
          <span>Provjera ograničenja</span>
          <strong className={violations.length ? 'bad' : 'good'}>
            {violations.length ? `${violations.length} kršenja` : 'Sve OK'}
          </strong>
        </div>
        <div>
          <span>Solver</span>
          <strong title={plan.solverUsed === 'exact' ? 'Dokazivo optimalan raspored' : 'Heuristika: bez jamstva optimuma'}>
            {plan.solverUsed === 'exact' ? 'Egzaktni' : 'Heuristika'}
          </strong>
        </div>
        <div>
          <span>Vrijeme izračuna</span>
          <strong>{Math.max(1, Math.round(plan.solveMs))} ms</strong>
        </div>
      </div>

      {plan.solverUsed === 'heuristic' && (
        <div className="alert alert-info">
          Raspored je izračunala <strong>heuristika</strong> ({input.orders.length} naloga). Rezultat je valjan prema
          svim pravilima, ali nema jamstva da je najkraći mogući. Za ≤ 12 naloga koristi se egzaktni solver.
        </div>
      )}

      {plan.unassigned.length > 0 && (
        <div className="alert alert-warn">
          <strong>
            Upozorenje: {plan.unassigned.length}{' '}
            {plan.unassigned.length === 1 ? 'nalog nije moguće izvršiti' : 'naloga nije moguće izvršiti'}
          </strong>
          <ul>
            {plan.unassigned.map((u) => {
              const o = input.orders.find((x) => x.id === u.orderId)!
              return (
                <li key={u.orderId}>
                  <strong>{u.orderId}</strong> ({o.machineId}, {o.pickupId} → {o.deliveryId}): {u.reason}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {violations.length > 0 && (
        <div className="alert alert-error">
          <strong>Validator je pronašao kršenja pravila:</strong>
          <ul>
            {violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card assignment">
        <div className="assign-head">
          <h3>Raspodjela naloga</h3>
          <div className="filter" role="group" aria-label="Filter vozila">
            <button
              className="btn-outline small"
              onClick={() => setPrintIds(plan.trucks.filter((t) => t.ordersCompleted > 0).map((t) => t.truck.id))}
              disabled={plan.ordersCompleted === 0}
            >
              Ispis za vozače
            </button>
            <span className="muted">Prikaži:</span>
            <button className="btn-link" onClick={() => setHidden(new Set())}>
              Sva
            </button>
            <button className="btn-link" onClick={() => setHidden(new Set(plan.trucks.map((t) => t.truck.id)))}>
              Nijedno
            </button>
          </div>
        </div>
        <div className="assign-rows">
          {plan.trucks.map((tp, i) => (
            <div key={tp.truck.id} className={`assign-row ${visible.has(tp.truck.id) ? '' : 'off'}`}>
              <label className="assign-truck">
                <input type="checkbox" checked={visible.has(tp.truck.id)} onChange={() => toggle(tp.truck.id)} />
                <span className="swatch" style={{ background: truckColor(i) }} /> {tp.truck.name}
                <small className="muted">{fmtKm(tp.totalKm)}</small>
              </label>
              <span className="chips">
                {tp.orderIds.length === 0 && <span className="muted">bez naloga</span>}
                {tp.orderIds.map((id) => {
                  const o = input.orders.find((x) => x.id === id)!
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

      <ScenarioCompare input={input} onApply={onApplySettings} />

      <Timeline plan={plan} settings={input.settings} visible={visible} selected={selected} onSelect={select} />

      {input.coordinateMode === 'geo' ? (
        <Suspense fallback={<div className="card">Učitavam kartu…</div>}>
          <GeoMap input={input} plan={plan} visible={visible} />
        </Suspense>
      ) : (
        <RouteMap input={input} plan={plan} visible={visible} />
      )}

      {plan.trucks.map((tp, i) =>
        visible.has(tp.truck.id) ? (
          <TruckResult
            key={tp.truck.id}
            plan={tp}
            color={truckColor(i)}
            settings={input.settings}
            selectedSeq={selected?.truckId === tp.truck.id ? selected.seq : undefined}
            onPrint={() => setPrintIds([tp.truck.id])}
          />
        ) : null,
      )}
      {printIds && <DriverSheets input={input} plan={plan} truckIds={printIds} onDone={donePrinting} />}
    </section>
  )
}
