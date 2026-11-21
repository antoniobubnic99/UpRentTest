import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import type { Result } from '../App'
import { truckColor } from '../colors'
import { fmtKm, fmtMin } from '../format'
import { tr } from '../i18n'
import type { Settings } from '../solver'
import { googleMapsRouteUrls } from '../data/googleMaps'
import { balanceSuggestion } from '../solver/scenarios'
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
  /** opens the order in the input panel (it is highlighted there) */
  onShowOrder: (orderId: string) => void
}

export function Results({ result, stale, onApplySettings, onShowOrder }: Props) {
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
  const suggestion = useMemo(() => {
    try {
      return balanceSuggestion(input, plan)
    } catch {
      return null
    }
  }, [input, plan])

  const locById = useMemo(() => new Map(input.locations.map((l) => [l.id, l])), [input])
  const stopsOf = (steps: { locationId: string }[]) =>
    steps
      .map((s) => locById.get(s.locationId))
      .filter((l) => l && Number.isFinite(l.lat) && Number.isFinite(l.lon))
      .map((l) => ({ lat: l!.lat!, lon: l!.lon! }))

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
  const balanced = (input.settings.objective ?? 'km') === 'balanced'

  return (
    <section className={stale ? 'is-stale' : ''}>
      <div className="section-head">
        <h2>{tr('res.title')}</h2>
        {stale && <span className="stale">{tr('res.stale')}</span>}
      </div>

      <div className="kpis">
        <div className="kpi-main">
          <span>{tr('res.totalKm')}</span>
          <strong>{fmtKm(plan.totalKm)}</strong>
        </div>
        <div>
          <span>{tr('res.ordersDone')}</span>
          <strong>
            {plan.ordersCompleted} / {input.orders.length}
          </strong>
        </div>
        <div>
          <span>{tr('res.trucksUsed')}</span>
          <strong>
            {plan.trucks.filter((t) => t.ordersCompleted > 0).length} / {plan.trucks.length}
          </strong>
        </div>
        <div>
          <span>{tr('res.check')}</span>
          <strong className={violations.length ? 'bad' : 'good'}>
            {violations.length ? tr('res.violations', { n: violations.length }) : tr('res.allOk')}
          </strong>
        </div>
        <div>
          <span>{tr('res.solver')}</span>
          <strong title={plan.solverUsed === 'exact' ? tr('res.exactTitle') : tr('res.heuristicTitle')}>
            {plan.solverUsed === 'exact' ? tr('set.solverExactLabel') : tr('set.solverHeuristicLabel')}
          </strong>
        </div>
        <div>
          <span>{tr('res.goal')}</span>
          <strong title={balanced ? tr('set.objectiveBalanced') : undefined}>{balanced ? tr('res.goalBalanced') : tr('set.objectiveKm')}</strong>
        </div>
        <div>
          <span>{tr('res.driveTime')}</span>
          <strong title={plan.timeUsed === 'road' ? tr('res.timeRoadTitle') : undefined}>
            {plan.timeUsed === 'road' ? tr('res.timeRoad') : tr('res.timeSpeed', { v: input.settings.speedKmh })}
          </strong>
        </div>
        <div>
          <span>{tr('res.solveTime')}</span>
          <strong>{Math.max(1, Math.round(plan.solveMs))} ms</strong>
        </div>
      </div>

      {result.notice && <div className="alert alert-warn">{result.notice}</div>}

      {plan.solverUsed === 'heuristic' && (
        <div className="alert alert-info">{tr('res.heuristicNote', { n: input.orders.length })}</div>
      )}

      {plan.timeFallbacks > 0 && <div className="alert alert-info">{tr('res.timeFallbackNote')}</div>}

      {plan.unassigned.length > 0 && (
        <div className="alert alert-warn">
          <strong>{tr('res.unassignedTitle', { n: plan.unassigned.length })}</strong>
          <ul>
            {plan.unassigned.map((u) => {
              const o = input.orders.find((x) => x.id === u.orderId)!
              return (
                <li key={u.orderId}>
                  <strong>{u.orderId}</strong> ({o.machineId}, {o.pickupId} → {o.deliveryId}): {u.reason}{' '}
                  <button className="btn-link" onClick={() => onShowOrder(u.orderId)}>
                    {tr('res.showInInput')}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {violations.length > 0 && (
        <div className="alert alert-error">
          <strong>{tr('res.validatorTitle')}</strong>
          <ul>
            {violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestion && (
        <div className="alert alert-info balance-hint">
          <div>
            <strong>{tr('res.idleTitle', { name: suggestion.idle.name, min: fmtMin(suggestion.idle.hours) })}</strong>{' '}
            {tr('res.idleText', {
              moves: suggestion.moves.map((m) => tr('res.idleMove', { truck: m.truck, ids: m.orderIds.join(', ') })).join('; '),
              km: fmtKm(suggestion.plan.totalKm),
              delta: fmtKm(suggestion.deltaKm),
              times: suggestion.plan.trucks.map((t) => `${t.truck.name} ${fmtMin(t.totalHours)}`).join(', '),
              pct: suggestion.settings.balanceMaxExtraPct ?? 10,
            })}
          </div>
          <button className="btn-secondary small" onClick={() => onApplySettings(suggestion.settings)}>
            {tr('res.applyBalanced')}
          </button>
        </div>
      )}

      <div className="card assignment">
        <div className="assign-head">
          <h3>{tr('res.assignment')}</h3>
          <div className="filter" role="group" aria-label={tr('res.filterAria')}>
            <button
              className="btn-outline small"
              onClick={() => setPrintIds(plan.trucks.filter((t) => t.ordersCompleted > 0).map((t) => t.truck.id))}
              disabled={plan.ordersCompleted === 0}
            >
              {tr('res.printAll')}
            </button>
            <span className="muted">{tr('res.show')}</span>
            <button className="btn-link" onClick={() => setHidden(new Set())}>
              {tr('res.all')}
            </button>
            <button className="btn-link" onClick={() => setHidden(new Set(plan.trucks.map((t) => t.truck.id)))}>
              {tr('res.none')}
            </button>
          </div>
        </div>
        <div className="assign-rows">
          {plan.trucks.map((tp, i) => (
            <div key={tp.truck.id} className={`assign-row ${visible.has(tp.truck.id) ? '' : 'off'}`}>
              <label className="assign-truck">
                <input type="checkbox" checked={visible.has(tp.truck.id)} onChange={() => toggle(tp.truck.id)} />
                <span className="swatch" style={{ background: truckColor(i) }} /> {tp.truck.name}
                <small className="muted">
                  {fmtKm(tp.totalKm)} · {fmtMin(tp.totalHours)}
                </small>
              </label>
              <span className="chips">
                {tp.orderIds.length === 0 && <span className="muted">{tr('res.noOrders')}</span>}
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
        <Suspense fallback={<div className="card">{tr('app.loadingMap')}</div>}>
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
            googleLinks={input.coordinateMode === 'geo' ? googleMapsRouteUrls(stopsOf(tp.steps)) : undefined}
          />
        ) : null,
      )}
      {printIds && <DriverSheets input={input} plan={plan} truckIds={printIds} onDone={donePrinting} />}
    </section>
  )
}
