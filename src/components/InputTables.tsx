import { useState } from 'react'
import {
  addLocation,
  addOrder,
  addTruck,
  cannotAddOrderReason,
  removeLocation,
  removeOrder,
  removeTruck,
  setBase,
} from '../data/edit'
import { fmtKg } from '../format'
import type { ProblemInput } from '../solver'

interface Props {
  input: ProblemInput
  onChange: (next: ProblemInput) => void
}

/** Inline confirmation shown instead of window.confirm. */
interface Pending {
  message: string
  confirmLabel?: string
  onConfirm?: () => void
}

function NumberCell({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      className="cell-input num"
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  )
}

function TextCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input className="cell-input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
}

function SelectCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select className="cell-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function RemoveButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button className="btn-icon" title={title} aria-label={title} onClick={onClick}>
      ×
    </button>
  )
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="empty-row">
        {text}
      </td>
    </tr>
  )
}

export function InputTables({ input, onChange }: Props) {
  const [pending, setPending] = useState<Pending | null>(null)

  const edit = (fn: (draft: ProblemInput) => void) => {
    const draft = structuredClone(input)
    fn(draft)
    onChange(draft)
  }
  const apply = (next: ProblemInput) => {
    setPending(null)
    onChange(next)
  }

  const locIds = input.locations.map((l) => l.id)
  const machineIds = input.machines.map((m) => m.id)
  const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))
  const orderBlock = cannotAddOrderReason(input)

  const askRemoveLocation = (id: string) => {
    const r = removeLocation(input, id)
    if (r.status === 'removed') apply(r.input)
    else if (r.status === 'blocked') setPending({ message: r.message })
    else
      setPending({
        message: r.message,
        confirmLabel: 'Obriši lokaciju i naloge',
        onConfirm: () => {
          const forced = removeLocation(input, id, true)
          if (forced.status === 'removed') apply(forced.input)
        },
      })
  }

  return (
    <div className="input-grid">
      {pending && (
        <div className={`confirm-bar ${pending.onConfirm ? 'confirm-warn' : 'confirm-info'}`} role="alert">
          <span>{pending.message}</span>
          <span className="confirm-actions">
            {pending.onConfirm && (
              <button className="btn-danger" onClick={pending.onConfirm}>
                {pending.confirmLabel ?? 'Obriši'}
              </button>
            )}
            <button className="btn-link" onClick={() => setPending(null)}>
              {pending.onConfirm ? 'Odustani' : 'U redu'}
            </button>
          </span>
        </div>
      )}

      <div className="card">
        <h3>Vozni park</h3>
        <table>
          <thead>
            <tr>
              <th>Vozilo</th>
              <th className="r">Nosivost (kg)</th>
              <th className="r">Max strojeva</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {input.trucks.length === 0 && <EmptyRow cols={4} text="Nema vozila." />}
            {input.trucks.map((t, i) => (
              <tr key={t.id}>
                <td>
                  <TextCell label={`Naziv vozila ${t.id}`} value={t.name} onChange={(v) => edit((d) => void (d.trucks[i].name = v))} />
                </td>
                <td className="r">
                  <NumberCell step={100} value={t.capacityKg} onChange={(v) => edit((d) => void (d.trucks[i].capacityKg = v))} />
                </td>
                <td className="r">
                  <NumberCell value={t.maxItems} onChange={(v) => edit((d) => void (d.trucks[i].maxItems = v))} />
                </td>
                <td className="r">
                  <RemoveButton title={`Ukloni ${t.name}`} onClick={() => apply(removeTruck(input, t.id))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row-actions">
          <button className="btn-secondary" onClick={() => apply(addTruck(input))}>
            + Dodaj vozilo
          </button>
          {input.baseId && <span className="hint">Sva vozila polaze iz baze {input.baseId} i vraćaju se u nju.</span>}
        </div>

        <h3 className="mt">Lokacije (km)</h3>
        <table>
          <thead>
            <tr>
              <th>Lokacija</th>
              <th>Naziv</th>
              <th className="r">X</th>
              <th className="r">Y</th>
              <th className="c">Baza</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {input.locations.length === 0 && <EmptyRow cols={6} text="Nema lokacija. Prva dodana lokacija postaje baza." />}
            {input.locations.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.id}</strong>
                </td>
                <td>
                  <TextCell label={`Naziv lokacije ${l.id}`} value={l.name} onChange={(v) => edit((d) => void (d.locations[i].name = v))} />
                </td>
                <td className="r">
                  <NumberCell value={l.x ?? NaN} onChange={(v) => edit((d) => void (d.locations[i].x = v))} />
                </td>
                <td className="r">
                  <NumberCell value={l.y ?? NaN} onChange={(v) => edit((d) => void (d.locations[i].y = v))} />
                </td>
                <td className="c">
                  <input
                    type="radio"
                    name="base"
                    aria-label={`${l.id} je baza`}
                    checked={l.id === input.baseId}
                    onChange={() => apply(setBase(input, l.id))}
                  />
                </td>
                <td className="r">
                  <RemoveButton title={`Ukloni lokaciju ${l.id}`} onClick={() => askRemoveLocation(l.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row-actions">
          <button className="btn-secondary" onClick={() => apply(addLocation(input))}>
            + Dodaj lokaciju
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Transportni nalozi</h3>
        <table>
          <thead>
            <tr>
              <th>Nalog</th>
              <th>Stroj</th>
              <th className="r">Težina (kg)</th>
              <th>Preuzimanje</th>
              <th>Isporuka</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {input.orders.length === 0 && <EmptyRow cols={6} text="Nema naloga." />}
            {input.orders.map((o, i) => {
              const mi = input.machines.findIndex((m) => m.id === o.machineId)
              return (
                <tr key={o.id}>
                  <td>
                    <strong>{o.id}</strong>
                  </td>
                  <td>
                    <SelectCell value={o.machineId} options={machineIds} onChange={(v) => edit((d) => void (d.orders[i].machineId = v))} />
                  </td>
                  <td className="r">
                    {mi >= 0 ? (
                      <NumberCell step={100} value={input.machines[mi].weightKg} onChange={(v) => edit((d) => void (d.machines[mi].weightKg = v))} />
                    ) : (
                      fmtKg(weight.get(o.machineId) ?? 0)
                    )}
                  </td>
                  <td>
                    <SelectCell value={o.pickupId} options={locIds} onChange={(v) => edit((d) => void (d.orders[i].pickupId = v))} />
                  </td>
                  <td>
                    <SelectCell value={o.deliveryId} options={locIds} onChange={(v) => edit((d) => void (d.orders[i].deliveryId = v))} />
                  </td>
                  <td className="r">
                    <RemoveButton title={`Ukloni nalog ${o.id}`} onClick={() => apply(removeOrder(input, o.id))} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="row-actions">
          <button className="btn-secondary" disabled={orderBlock !== null} onClick={() => apply(addOrder(input))}>
            + Dodaj nalog
          </button>
          <span className="hint">
            {orderBlock ?? 'Težina se uređuje po stroju. Npr. stavi 12.000 kg da vidiš upozorenje.'}
          </span>
        </div>
      </div>
    </div>
  )
}
