import type { Settings, TimeLimitMode } from '../solver'

interface Props {
  settings: Settings
  onChange: (next: Settings) => void
}

const MODES: { value: TimeLimitMode; label: string; help: string }[] = [
  {
    value: 'drive+handling',
    label: 'Vožnja + utovar/istovar',
    help: 'Radni dan vozača: vrijeme vožnje plus 20 min po svakom preuzimanju i isporuci. Zadana pretpostavka.',
  },
  { value: 'drive', label: 'Samo vožnja', help: 'U limit se računa samo vrijeme vožnje (km / brzina).' },
  { value: 'none', label: 'Bez limita', help: 'Čista minimizacija kilometara, služi za usporedbu.' },
]

export function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  const active = MODES.find((m) => m.value === settings.timeLimitMode)!

  return (
    <div className="card settings">
      <div className="settings-fields">
        <label>
          Dnevni limit (h)
          <input
            className="cell-input num"
            type="number"
            step={0.5}
            value={settings.maxHoursPerDay}
            onChange={(e) => set('maxHoursPerDay', Number(e.target.value))}
          />
        </label>
        <label>
          Utovar / istovar (min)
          <input
            className="cell-input num"
            type="number"
            value={settings.handlingMinutes}
            onChange={(e) => set('handlingMinutes', Number(e.target.value))}
          />
        </label>
        <label>
          Prosječna brzina (km/h)
          <input
            className="cell-input num"
            type="number"
            value={settings.speedKmh}
            onChange={(e) => set('speedKmh', Number(e.target.value))}
          />
        </label>
      </div>
      <div className="mode">
        <span className="mode-label">Što ulazi u dnevni limit</span>
        <div className="segmented" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={settings.timeLimitMode === m.value}
              className={settings.timeLimitMode === m.value ? 'active' : ''}
              onClick={() => set('timeLimitMode', m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint">{active.help}</p>
      </div>
    </div>
  )
}
