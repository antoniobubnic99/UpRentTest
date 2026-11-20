import { useState } from 'react'
import { geoExampleInput } from '../data/defaultData'
import { switchCoordinateMode } from '../data/edit'
import type { CoordinateMode, ProblemInput } from '../solver'
import { ConfirmBar } from './InputTables'

interface Props {
  input: ProblemInput
  onChange: (next: ProblemInput) => void
}

const OPTIONS: { value: CoordinateMode; label: string }[] = [
  { value: 'xy', label: 'Koordinatni sustav (zadatak)' },
  { value: 'geo', label: 'Stvarna karta' },
]

/** Switch between the task's grid and real map positions (F7); asks before data is lost. */
export function ModeSwitch({ input, onChange }: Props) {
  const [pending, setPending] = useState<CoordinateMode | null>(null)
  const willLose = input.locations.length + input.orders.length > 0

  const choose = (mode: CoordinateMode) => {
    if (mode === input.coordinateMode) return
    if (willLose) setPending(mode)
    else onChange(switchCoordinateMode(input, mode))
  }

  return (
    <div className="mode-switch">
      <div className="segmented" role="radiogroup" aria-label="Način lokacija">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={input.coordinateMode === o.value}
            className={input.coordinateMode === o.value ? 'active' : ''}
            onClick={() => choose(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {input.coordinateMode === 'geo' && (
        <button className="btn-link" onClick={() => onChange(geoExampleInput())}>
          Učitaj primjer: okolica Zagreba
        </button>
      )}
      {pending && (
        <ConfirmBar
          pending={{
            message: `Promjena načina briše lokacije (${input.locations.length}) i naloge (${input.orders.length}), jer koordinate jednog načina ne vrijede u drugom. Vozila i postavke ostaju. Nastaviti?`,
            confirmLabel: 'Promijeni i obriši',
            onConfirm: () => {
              onChange(switchCoordinateMode(input, pending))
              setPending(null)
            },
          }}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
