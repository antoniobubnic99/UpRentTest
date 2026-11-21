import { useState } from 'react'
import { geoExampleInput } from '../data/defaultData'
import { switchCoordinateMode } from '../data/edit'
import { tr } from '../i18n'
import type { CoordinateMode, ProblemInput } from '../solver'
import { ConfirmBar } from './InputTables'

interface Props {
  input: ProblemInput
  onChange: (next: ProblemInput) => void
}

/** Switch between the task's grid and real map positions (F7); asks before data is lost. */
export function ModeSwitch({ input, onChange }: Props) {
  const [pending, setPending] = useState<CoordinateMode | null>(null)
  const willLose = input.locations.length + input.orders.length > 0
  const options: { value: CoordinateMode; label: string }[] = [
    { value: 'xy', label: tr('mode.xyTask') },
    { value: 'geo', label: tr('mode.geo') },
  ]

  const choose = (mode: CoordinateMode) => {
    if (mode === input.coordinateMode) return
    if (willLose) setPending(mode)
    else onChange(switchCoordinateMode(input, mode))
  }

  return (
    <div className="mode-switch">
      <div className="segmented" role="radiogroup" aria-label={tr('mode.aria')}>
        {options.map((o) => (
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
          {tr('mode.loadExample')}
        </button>
      )}
      {pending && (
        <ConfirmBar
          pending={{
            message: tr('mode.confirm', { locations: input.locations.length, orders: input.orders.length }),
            confirmLabel: tr('mode.confirmBtn'),
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
