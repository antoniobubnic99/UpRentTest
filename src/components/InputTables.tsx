import { useState, type ReactNode } from 'react'
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
import type { ProblemInput } from '../solver'

/**
 * Editable input data, one panel per drawer tab (Vozila / Lokacije / Nalozi).
 * All edits go through the pure functions in data/edit.ts, which keep referential integrity.
 */

interface PanelProps {
  input: ProblemInput
  onChange: (next: ProblemInput) => void
}

/** Inline confirmation shown instead of window.confirm. */
interface Pending {
  message: string
  confirmLabel?: string
  onConfirm?: () => void
}

export function ConfirmBar({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  return (
    <div className={`confirm-bar ${pending.onConfirm ? 'confirm-warn' : 'confirm-info'}`} role="alert">
      <span>{pending.message}</span>
      <span className="confirm-actions">
        {pending.onConfirm && (
          <button className="btn-danger" onClick={pending.onConfirm}>
            {pending.confirmLabel ?? 'Obriši'}
          </button>
        )}
        <button className="btn-link" onClick={onClose}>
          {pending.onConfirm ? 'Odustani' : 'U redu'}
        </button>
      </span>
    </div>
  )
}

export function NumberCell({
  value,
  onChange,
  step = 1,
  label,
  className = '',
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  label: string
  className?: string
}) {
  return (
    <input
      className={`cell-input num ${className}`}
      type="number"
      step={step}
      aria-label={label}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  )
}

/** Optional minutes: empty = global default (shown as placeholder); a custom value is highlighted. */
function MinutesCell({
  value,
  fallback,
  label,
  onChange,
}: {
  value: number | undefined
  fallback: number
  label: string
  onChange: (v: number | undefined) => void
}) {
  const custom = value !== undefined && value !== fallback
  return (
    <input
      className={`cell-input num min${custom ? ' custom' : ''}`}
      type="number"
      min={0}
      step={5}
      aria-label={label}
      placeholder={String(fallback)}
      title={custom ? `Posebno vrijeme (zadano je ${fallback} min)` : `Zadano: ${fallback} min`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  )
}

export function TextCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input className="cell-input text" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
}

function SelectCell({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  label: string
}) {
  return (
    <select className="cell-input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function RemoveButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button className="btn-icon" title={title} aria-label={title} onClick={onClick}>
      ×
    </button>
  )
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="empty-row">{children}</p>
}

function useEdit({ input, onChange }: PanelProps) {
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
  return { pending, setPending, edit, apply }
}

export function TrucksPanel(props: PanelProps) {
  const { input } = props
  const { edit, apply } = useEdit(props)
  return (
    <div className="panel">
      <table className="edit-table">
        <thead>
          <tr>
            <th>Vozilo</th>
            <th className="r">Nosivost (kg)</th>
            <th className="r">Max strojeva</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {input.trucks.map((t, i) => (
            <tr key={t.id}>
              <td>
                <TextCell label={`Naziv vozila ${t.id}`} value={t.name} onChange={(v) => edit((d) => void (d.trucks[i].name = v))} />
              </td>
              <td className="r">
                <NumberCell
                  label={`Nosivost ${t.name} (kg)`}
                  step={100}
                  value={t.capacityKg}
                  className="wide"
                  onChange={(v) => edit((d) => void (d.trucks[i].capacityKg = v))}
                />
              </td>
              <td className="r">
                <NumberCell
                  label={`Max strojeva ${t.name}`}
                  value={t.maxItems}
                  onChange={(v) => edit((d) => void (d.trucks[i].maxItems = v))}
                />
              </td>
              <td className="r">
                <RemoveButton title={`Ukloni ${t.name}`} onClick={() => apply(removeTruck(input, t.id))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {input.trucks.length === 0 && <EmptyNote>Nema vozila.</EmptyNote>}
      <div className="row-actions">
        <button className="btn-secondary" onClick={() => apply(addTruck(input))}>
          + Dodaj vozilo
        </button>
        {input.baseId && <span className="hint">Sva vozila polaze iz baze {input.baseId} i vraćaju se u nju.</span>}
      </div>
    </div>
  )
}

export function LocationsPanel(props: PanelProps & { geoExtras?: ReactNode }) {
  const { input, geoExtras } = props
  const { pending, setPending, edit, apply } = useEdit(props)
  const geo = input.coordinateMode === 'geo'

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
    <div className="panel">
      {pending && <ConfirmBar pending={pending} onClose={() => setPending(null)} />}
      {geoExtras}
      <table className="edit-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Naziv</th>
            <th className="r">{geo ? 'Širina' : 'X (km)'}</th>
            <th className="r">{geo ? 'Dužina' : 'Y (km)'}</th>
            <th className="c">Baza</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {input.locations.map((l, i) => (
            <tr key={l.id}>
              <td>
                <strong>{l.id}</strong>
              </td>
              <td>
                <TextCell
                  label={`Naziv lokacije ${l.id}`}
                  value={l.name}
                  onChange={(v) => edit((d) => void (d.locations[i].name = v))}
                />
                {geo && l.address && (
                  <div className="addr" title={l.address}>
                    {l.address}
                  </div>
                )}
              </td>
              {geo ? (
                <>
                  <td className="r">
                    <NumberCell
                      label={`Geografska širina ${l.id}`}
                      step={0.0001}
                      value={l.lat ?? NaN}
                      className="coord"
                      onChange={(v) => edit((d) => void (d.locations[i].lat = v))}
                    />
                  </td>
                  <td className="r">
                    <NumberCell
                      label={`Geografska dužina ${l.id}`}
                      step={0.0001}
                      value={l.lon ?? NaN}
                      className="coord"
                      onChange={(v) => edit((d) => void (d.locations[i].lon = v))}
                    />
                  </td>
                </>
              ) : (
                <>
                  <td className="r">
                    <NumberCell label={`X ${l.id}`} value={l.x ?? NaN} onChange={(v) => edit((d) => void (d.locations[i].x = v))} />
                  </td>
                  <td className="r">
                    <NumberCell label={`Y ${l.id}`} value={l.y ?? NaN} onChange={(v) => edit((d) => void (d.locations[i].y = v))} />
                  </td>
                </>
              )}
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
      {input.locations.length === 0 && (
        <EmptyNote>
          Nema lokacija. Prva dodana lokacija postaje baza.
          {geo && ' Klikni na kartu ili potraži adresu.'}
        </EmptyNote>
      )}
      <div className="row-actions">
        <button
          className="btn-secondary"
          onClick={() => apply(geo ? addLocation(input, { lat: 45.815, lon: 15.982 }) : addLocation(input))}
        >
          + Dodaj lokaciju
        </button>
        {geo && <span className="hint">Bez karte nova lokacija dobiva koordinate središta Zagreba.</span>}
      </div>
    </div>
  )
}

export function OrdersPanel(props: PanelProps) {
  const { input } = props
  const { edit, apply } = useEdit(props)
  const orderBlock = cannotAddOrderReason(input)
  const locOptions = input.locations.map((l) => ({
    value: l.id,
    label: l.name && l.name !== l.id ? `${l.id} · ${l.name}` : l.id,
  }))
  const fallback = input.settings.handlingMinutes

  return (
    <div className="panel">
      <div className="orders">
        {input.orders.map((o, i) => {
          const mi = input.machines.findIndex((m) => m.id === o.machineId)
          return (
            <div className="order-item" key={o.id}>
              <div className="order-head">
                <strong>{o.id}</strong>
                <SelectCell
                  label={`Preuzimanje ${o.id}`}
                  value={o.pickupId}
                  options={locOptions}
                  onChange={(v) => edit((d) => void (d.orders[i].pickupId = v))}
                />
                <span className="arrow" aria-hidden>
                  →
                </span>
                <SelectCell
                  label={`Isporuka ${o.id}`}
                  value={o.deliveryId}
                  options={locOptions}
                  onChange={(v) => edit((d) => void (d.orders[i].deliveryId = v))}
                />
                <RemoveButton title={`Ukloni nalog ${o.id}`} onClick={() => apply(removeOrder(input, o.id))} />
              </div>
              <div className="order-meta">
                <label>
                  <span>Stroj {o.machineId} (kg)</span>
                  {mi >= 0 && (
                    <NumberCell
                      label={`Težina stroja ${o.machineId} (kg)`}
                      step={100}
                      className="wide"
                      value={input.machines[mi].weightKg}
                      onChange={(v) => edit((d) => void (d.machines[mi].weightKg = v))}
                    />
                  )}
                </label>
                <label>
                  <span>Utovar (min)</span>
                  <MinutesCell
                    label={`Utovar ${o.id} (min)`}
                    value={o.pickupMinutes}
                    fallback={fallback}
                    onChange={(v) => edit((d) => void (d.orders[i].pickupMinutes = v))}
                  />
                </label>
                <label>
                  <span>Istovar (min)</span>
                  <MinutesCell
                    label={`Istovar ${o.id} (min)`}
                    value={o.deliveryMinutes}
                    fallback={fallback}
                    onChange={(v) => edit((d) => void (d.orders[i].deliveryMinutes = v))}
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
      {input.orders.length === 0 && <EmptyNote>Nema naloga.</EmptyNote>}
      <div className="row-actions">
        <button className="btn-secondary" disabled={orderBlock !== null} onClick={() => apply(addOrder(input))}>
          + Dodaj nalog
        </button>
        <span className="hint">
          {orderBlock ?? `Utovar/istovar: prazno = zadano (${fallback} min); veći teret može imati duže vrijeme.`}
        </span>
      </div>
    </div>
  )
}
