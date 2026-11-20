import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtHours, fmtKg, fmtKm } from '../format'
import type { Location, Plan, ProblemInput, RouteStep } from '../solver'

interface Props {
  input: ProblemInput
  plan: Plan
  truckIds: string[]
  onDone: () => void
}

const ACTION: Record<RouteStep['action'], string> = {
  start: 'Polazak',
  pickup: 'Utovar',
  delivery: 'Istovar',
  break: 'Pauza',
  return: 'Povratak',
}

function place(l: Location | undefined, mode: ProblemInput['coordinateMode']): string {
  if (!l) return ''
  if (l.address) return l.address
  if (mode === 'geo') return `${l.lat?.toFixed(5)}, ${l.lon?.toFixed(5)}`
  return `(${l.x}, ${l.y}) km`
}

/** Clock time when the day starts at 07:00 (shown next to the elapsed time). */
function clock(h: number, startHour = 7): string {
  const m = Math.round((startHour + h) * 60)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

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
  const [today] = useState(() => new Date().toLocaleDateString('hr-HR'))
  const trucks = plan.trucks.filter((t) => truckIds.includes(t.truck.id) && t.ordersCompleted > 0)

  return createPortal(
    <div className="print-area">
      {trucks.map((tp) => (
        <section className="sheet" key={tp.truck.id}>
          <header className="sheet-head">
            <div>
              <div className="sheet-brand">UP RENT · Plan vožnje</div>
              <h1>{tp.truck.name}</h1>
              <div className="sheet-sub">
                Nosivost {fmtKg(tp.truck.capacityKg)} · najviše {tp.truck.maxItems} stroja · baza {input.baseId}{' '}
                {loc.get(input.baseId)?.name && `(${loc.get(input.baseId)!.name})`}
              </div>
            </div>
            <table className="sheet-facts">
              <tbody>
                <tr>
                  <th>Datum</th>
                  <td>{today}</td>
                </tr>
                <tr>
                  <th>Nalozi</th>
                  <td>{tp.orderIds.join(', ')}</td>
                </tr>
                <tr>
                  <th>Ukupno</th>
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
                <th>Vrijeme*</th>
                <th>Lokacija</th>
                <th>Radnja</th>
                <th>Nalog / stroj</th>
                <th className="r">Dionica</th>
                <th className="r">Teret nakon</th>
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
                    <td>{ACTION[s.action]}</td>
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
            * Okvirno vrijeme uz početak rada u 07:00 i prosječnu brzinu {input.settings.speedKmh} km/h. Vožnja{' '}
            {fmtHours(tp.driveHours)}, utovar/istovar {fmtHours(tp.handlingHours)}
            {tp.breakHours > 0 && `, pauza ${fmtHours(tp.breakHours)}`}.
          </p>

          <div className="sheet-sign">
            <div>Vozač</div>
            <div>Dispečer</div>
            <div>Napomene</div>
          </div>
          <footer className="sheet-foot">
            Izrađeno u UP RENT Smart Logistics Planneru (prototip, nije službeni dokument Up Rent d.o.o.)
          </footer>
        </section>
      ))}
    </div>,
    document.body,
  )
}
