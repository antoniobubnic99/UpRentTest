import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtClock, fmtHours, fmtKg, fmtKm } from '../format'
import { locale, tr } from '../i18n'
import type { Location, Plan, ProblemInput, RouteStep } from '../solver'

interface Props {
  input: ProblemInput
  plan: Plan
  truckIds: string[]
  onDone: () => void
}

const action = (a: RouteStep['action']) => tr(`sheet.${a}`)

function place(l: Location | undefined, mode: ProblemInput['coordinateMode']): string {
  if (!l) return ''
  if (l.address) return l.address
  if (mode === 'geo') return `${l.lat?.toFixed(5)}, ${l.lon?.toFixed(5)}`
  return `(${l.x}, ${l.y}) km`
}

const clock = (h: number) => fmtClock(h, 7)

/**
 * Printable driver's plan (one page per vehicle). Rendered into <body> only while
 * printing; @media print hides the app and shows these sheets. "Save as PDF" in the
 * browser's print dialog gives a PDF.
 */
export function DriverSheets({ input, plan, truckIds, onDone }: Props) {
  useEffect(() => {
    const done = () => onDone()
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [onDone])

  const loc = new Map(input.locations.map((l) => [l.id, l]))
  const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const [today] = useState(() => new Date().toLocaleDateString(locale()))
  const trucks = plan.trucks.filter((t) => truckIds.includes(t.truck.id) && t.ordersCompleted > 0)

  return createPortal(
    <div className="print-area">
      {trucks.map((tp) => (
        <section className="sheet" key={tp.truck.id}>
          <header className="sheet-head">
            <div>
              <div className="sheet-brand">UP RENT · {tr('sheet.title')}</div>
              <h1>{tp.truck.name}</h1>
              <div className="sheet-sub">
                {tr('sheet.sub', { kg: fmtKg(tp.truck.capacityKg), n: tp.truck.maxItems, base: input.baseId })}{' '}
                {loc.get(input.baseId)?.name && `(${loc.get(input.baseId)!.name})`}
              </div>
            </div>
            <table className="sheet-facts">
              <tbody>
                <tr>
                  <th>{tr('sheet.date')}</th>
                  <td>{today}</td>
                </tr>
                <tr>
                  <th>{tr('app.tabOrders')}</th>
                  <td>{tp.orderIds.join(', ')}</td>
                </tr>
                <tr>
                  <th>{tr('truck.cumulative')}</th>
                  <td>
                    {fmtKm(tp.totalKm)} · {fmtHours(tp.totalHours)}
                  </td>
                </tr>
              </tbody>
            </table>
          </header>

          <table className="sheet-steps">
            <thead>
              <tr>
                <th>#</th>
                <th>{tr('sheet.time')}*</th>
                <th>{tr('truck.location')}</th>
                <th>{tr('truck.action')}</th>
                <th>{tr('truck.orderMachine')}</th>
                <th className="r">{tr('truck.leg')}</th>
                <th className="r">{tr('sheet.loadAfter')}</th>
                <th className="check">✓</th>
              </tr>
            </thead>
            <tbody>
              {tp.steps.map((s) => {
                const l = loc.get(s.locationId)
                return (
                  <tr key={s.seq} className={`act-${s.action}`}>
                    <td>{s.seq}</td>
                    <td className="nowrap">
                      {clock(s.arrivalHours)}
                      {s.departureHours > s.arrivalHours + 1e-9 && `–${clock(s.departureHours)}`}
                    </td>
                    <td>
                      <strong>{s.locationId}</strong> {l?.name && l.name !== l.id ? l.name : ''}
                      <span className="sheet-place">{place(l, input.coordinateMode)}</span>
                    </td>
                    <td>{action(s.action)}</td>
                    <td>
                      {s.orderId
                        ? `${s.orderId} · ${s.machineId} (${fmtKg(weight.get(s.machineId!) ?? 0)})`
                        : ''}
                    </td>
                    <td className="r nowrap">{s.action === 'start' || s.action === 'break' ? '' : fmtKm(s.legKm)}</td>
                    <td className="r nowrap">
                      {s.action === 'pickup' || s.action === 'delivery'
                        ? `${fmtKg(s.loadKg)} · ${s.loadCount}/${tp.truck.maxItems}`
                        : ''}
                    </td>
                    <td className="check" />
                  </tr>
                )
              })}
            </tbody>
          </table>

          <p className="sheet-note">
            *{' '}
            {tr('sheet.note', {
              speed: plan.timeUsed === 'road' ? tr('sheet.speedRoad') : tr('sheet.speedAvg', { v: input.settings.speedKmh }),
              drive: fmtHours(tp.driveHours),
              handling: fmtHours(tp.handlingHours),
              brk: tp.breakHours > 0 ? fmtHours(tp.breakHours) : '',
            })}
          </p>

          <div className="sheet-sign">
            <div>{tr('sheet.driver')}</div>
            <div>{tr('sheet.dispatcher')}</div>
            <div>{tr('sheet.notes')}</div>
          </div>
          <footer className="sheet-foot">
            {tr('sheet.foot')}
          </footer>
        </section>
      ))}
    </div>,
    document.body,
  )
}
