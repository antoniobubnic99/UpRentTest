import { MAX_EXACT_ORDERS, type CoordinateMode, type Settings, type SolverMode, type TimeLimitMode } from '../solver'

interface Props {
  settings: Settings
  onChange: (next: Settings) => void
  orderCount: number
  coordinateMode: CoordinateMode
}

const MODES: { value: TimeLimitMode; label: string; help: string }[] = [
  {
    value: 'drive+handling',
    label: 'Vožnja + utovar/istovar',
    help: 'Radni dan vozača: vrijeme vožnje plus utovar/istovar svake radnje (i pauza, ako je uključena). Zadana pretpostavka.',
  },
  { value: 'drive', label: 'Samo vožnja', help: 'U limit se računa samo vrijeme vožnje (km / brzina), bez utovara i pauze.' },
  { value: 'none', label: 'Bez limita', help: 'Čista minimizacija kilometara, služi za usporedbu.' },
]

const SOLVERS: { value: SolverMode; label: string }[] = [
  { value: 'auto', label: 'Automatski' },
  { value: 'exact', label: 'Egzaktni' },
  { value: 'heuristic', label: 'Heuristika' },
]

function solverHelp(mode: SolverMode, orders: number): string {
  const tooMany = orders > MAX_EXACT_ORDERS
  switch (mode) {
    case 'auto':
      return tooMany
        ? `${orders} naloga > ${MAX_EXACT_ORDERS}: koristit će se heuristika (brza, bez jamstva optimuma).`
        : `Do ${MAX_EXACT_ORDERS} naloga egzaktni solver (dokazivo optimalan), iznad toga heuristika.`
    case 'exact':
      return tooMany
        ? `Egzaktni solver podržava najviše ${MAX_EXACT_ORDERS} naloga (sada ${orders}). Odaberi Automatski ili Heuristiku.`
        : 'Dokazivo optimalan raspored (dinamičko programiranje).'
    case 'heuristic':
      return 'Umetanje + lokalna pretraga + ruin & recreate. Brzo i za 50+ naloga, ali bez jamstva optimuma.'
  }
}

export function SettingsPanel({ settings, onChange, orderCount, coordinateMode }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  const active = MODES.find((m) => m.value === settings.timeLimitMode)!
  const exactBlocked = orderCount > MAX_EXACT_ORDERS

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
        {coordinateMode === 'geo' && settings.distanceSource === 'air' && (
          <label title="Zračna udaljenost × faktor ≈ udaljenost po cesti">
            Faktor ceste
            <input
              className="cell-input num"
              type="number"
              step={0.05}
              min={1}
              value={settings.roadFactor}
              onChange={(e) => set('roadFactor', Number(e.target.value))}
            />
          </label>
        )}
        <div className="break-field">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.breakEnabled}
              onChange={(e) => set('breakEnabled', e.target.checked)}
            />
            Obavezna pauza (gablec)
          </label>
          <input
            className="cell-input num"
            type="number"
            aria-label="Trajanje pauze (min)"
            disabled={!settings.breakEnabled}
            value={settings.breakMinutes}
            onChange={(e) => set('breakMinutes', Number(e.target.value))}
          />
          <span className="unit">min</span>
        </div>
      </div>

      <div className="settings-modes">
        <div className="mode">
          <span className="mode-label">Što ulazi u dnevni limit</span>
          <div className="segmented" role="radiogroup" aria-label="Što ulazi u dnevni limit">
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

        {coordinateMode === 'geo' && (
          <div className="mode">
            <span className="mode-label">Udaljenosti na stvarnoj karti</span>
            <div className="segmented" role="radiogroup" aria-label="Udaljenosti na stvarnoj karti">
              {(
                [
                  ['road', 'Po cestama (OSRM)'],
                  ['air', 'Zračna × faktor'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={settings.distanceSource === v}
                  className={settings.distanceSource === v ? 'active' : ''}
                  onClick={() => set('distanceSource', v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint">
              {settings.distanceSource === 'road'
                ? 'Stvarne udaljenosti vožnje po cestovnoj mreži (OpenStreetMap, OSRM). Ako servis nije dostupan, koristi se zračna udaljenost × faktor.'
                : `Zračna udaljenost × ${settings.roadFactor}: radi bez interneta, ali je samo procjena.`}
            </p>
          </div>
        )}

        <div className="mode">
          <span className="mode-label">Solver</span>
          <div className="segmented" role="radiogroup" aria-label="Solver">
            {SOLVERS.map((m) => (
              <button
                key={m.value}
                role="radio"
                aria-checked={settings.solverMode === m.value}
                className={settings.solverMode === m.value ? 'active' : ''}
                disabled={m.value === 'exact' && exactBlocked && settings.solverMode !== 'exact'}
                title={m.value === 'exact' && exactBlocked ? `Najviše ${MAX_EXACT_ORDERS} naloga` : undefined}
                onClick={() => set('solverMode', m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className={`hint ${settings.solverMode === 'exact' && exactBlocked ? 'warn-text' : ''}`}>
            {solverHelp(settings.solverMode, orderCount)}
          </p>
        </div>
      </div>
    </div>
  )
}
