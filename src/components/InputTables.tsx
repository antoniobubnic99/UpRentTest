import type { ProblemInput } from '../solver'
import { fmtKg } from '../format'

interface Props {
  input: ProblemInput
  onChange: (next: ProblemInput) => void
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

export function InputTables({ input, onChange }: Props) {
  const edit = (fn: (draft: ProblemInput) => void) => {
    const draft = structuredClone(input)
    fn(draft)
    onChange(draft)
  }
  const locIds = input.locations.map((l) => l.id)
  const machineIds = input.machines.map((m) => m.id)
  const weight = new Map(input.machines.map((m) => [m.id, m.weightKg]))

  const nextId = (prefix: string, ids: string[]) => {
    let i = ids.length + 1
    while (ids.includes(`${prefix}${String(i).padStart(2, '0')}`)) i++
    return `${prefix}${String(i).padStart(2, '0')}`
  }

  const addOrder = () =>
    edit((d) => {
      const mId = nextId('M', d.machines.map((m) => m.id))
      d.machines.push({ id: mId, weightKg: 1000 })
      d.orders.push({ id: nextId('N', d.orders.map((o) => o.id)), machineId: mId, pickupId: 'L1', deliveryId: 'L2' })
    })

  const removeOrder = (id: string) =>
    edit((d) => {
      const o = d.orders.find((x) => x.id === id)
      d.orders = d.orders.filter((x) => x.id !== id)
      if (o && !d.orders.some((x) => x.machineId === o.machineId))
        d.machines = d.machines.filter((m) => m.id !== o.machineId)
    })

  return (
    <div className="input-grid">
      <div className="card">
        <h3>Vozni park</h3>
        <table>
          <thead>
            <tr>
              <th>Vozilo</th>
              <th className="r">Nosivost (kg)</th>
              <th className="r">Max strojeva</th>
            </tr>
          </thead>
          <tbody>
            {input.trucks.map((t, i) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                </td>
                <td className="r">
                  <NumberCell step={100} value={t.capacityKg} onChange={(v) => edit((d) => void (d.trucks[i].capacityKg = v))} />
                </td>
                <td className="r">
                  <NumberCell value={t.maxItems} onChange={(v) => edit((d) => void (d.trucks[i].maxItems = v))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Oba kamiona polaze iz baze {input.baseId} i vraćaju se u nju.</p>

        <h3 className="mt">Lokacije (km)</h3>
        <table>
          <thead>
            <tr>
              <th>Lokacija</th>
              <th className="r">X</th>
              <th className="r">Y</th>
            </tr>
          </thead>
          <tbody>
            {input.locations.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.id}</strong> {l.id === input.baseId && <span className="tag">Baza</span>}
                </td>
                <td className="r">
                  <NumberCell value={l.x} onChange={(v) => edit((d) => void (d.locations[i].x = v))} />
                </td>
                <td className="r">
                  <NumberCell value={l.y} onChange={(v) => edit((d) => void (d.locations[i].y = v))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                    <button className="btn-icon" title="Ukloni nalog" onClick={() => removeOrder(o.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="row-actions">
          <button className="btn-secondary" onClick={addOrder}>
            + Dodaj nalog
          </button>
          <span className="hint">Težina se uređuje po stroju. Npr. stavi 12.000 kg da vidiš upozorenje.</span>
        </div>
      </div>
    </div>
  )
}
