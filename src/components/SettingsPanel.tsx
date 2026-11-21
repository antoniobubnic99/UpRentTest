import { tr } from '../i18n'
import {
  MAX_EXACT_ORDERS,
  type CoordinateMode,
  type Objective,
  type Settings,
  type SolverMode,
  type TimeLimitMode,
  type TravelTimeSource,
} from '../solver'

interface Props {
  settings: Settings
  onChange: (next: Settings) => void
  orderCount: number
  coordinateMode: CoordinateMode
}

function solverHelp(mode: SolverMode, orders: number): string {
  const tooMany = orders > MAX_EXACT_ORDERS
  switch (mode) {
    case 'auto':
      return tooMany
        ? tr('set.solverAutoMany', { n: orders, max: MAX_EXACT_ORDERS })
        : tr('set.solverAuto', { max: MAX_EXACT_ORDERS })
    case 'exact':
      return tooMany ? tr('set.solverExactMany', { n: orders, max: MAX_EXACT_ORDERS }) : tr('set.solverExact')
    case 'heuristic':
      return tr('set.solverHeuristic')
  }
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  disabled?: (v: T) => boolean
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          disabled={disabled?.(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel({ settings, onChange, orderCount, coordinateMode }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  const exactBlocked = orderCount > MAX_EXACT_ORDERS
  const geo = coordinateMode === 'geo'
  const roadTimes = geo && settings.distanceSource === 'road' && (settings.travelTimeSource ?? 'road') === 'road'
  const objective = settings.objective ?? 'km'

  const modes: { value: TimeLimitMode; label: string; help: string }[] = [
    { value: 'drive+handling', label: tr('set.limitDriveHandling'), help: tr('set.limitDriveHandlingHelp') },
    { value: 'drive', label: tr('set.limitDrive'), help: tr('set.limitDriveHelp') },
    { value: 'none', label: tr('set.limitNone'), help: tr('set.limitNoneHelp') },
  ]
  const active = modes.find((m) => m.value === settings.timeLimitMode)!

  return (
    <div className="card settings">
      <div className="settings-fields">
        <label>
          {tr('set.dailyLimit')}
          <input
            className="cell-input num"
            type="number"
            step={0.5}
            value={settings.maxHoursPerDay}
            onChange={(e) => set('maxHoursPerDay', Number(e.target.value))}
          />
        </label>
        <label>
          {tr('set.handling')}
          <input
            className="cell-input num"
            type="number"
            value={settings.handlingMinutes}
            onChange={(e) => set('handlingMinutes', Number(e.target.value))}
          />
        </label>
        <label title={roadTimes ? tr('set.speedFallbackTitle') : undefined}>
          {roadTimes ? tr('set.speedFallback') : tr('set.speed')}
          <input
            className="cell-input num"
            type="number"
            value={settings.speedKmh}
            onChange={(e) => set('speedKmh', Number(e.target.value))}
          />
        </label>
        {roadTimes && (
          <label title={tr('set.truckMaxTitle')}>
            {tr('set.truckMax')}
            <input
              className="cell-input num"
              type="number"
              min={1}
              value={settings.truckMaxSpeedKmh ?? 80}
              onChange={(e) => set('truckMaxSpeedKmh', Number(e.target.value))}
            />
          </label>
        )}
        {geo && settings.distanceSource === 'air' && (
          <label title={tr('set.roadFactorTitle')}>
            {tr('set.roadFactor')}
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
            <input type="checkbox" checked={settings.breakEnabled} onChange={(e) => set('breakEnabled', e.target.checked)} />
            {tr('set.break')}
          </label>
          <input
            className="cell-input num"
            type="number"
            aria-label={tr('set.breakAria')}
            disabled={!settings.breakEnabled}
            value={settings.breakMinutes}
            onChange={(e) => set('breakMinutes', Number(e.target.value))}
          />
          <span className="unit">min</span>
        </div>
      </div>

      <div className="settings-modes">
        <div className="mode">
          <span className="mode-label">{tr('set.objective')}</span>
          <Segmented<Objective>
            label={tr('set.objective')}
            value={objective}
            options={[
              { value: 'km', label: tr('set.objectiveKm') },
              { value: 'balanced', label: tr('set.objectiveBalanced') },
            ]}
            onChange={(v) => set('objective', v)}
          />
          {objective === 'balanced' && (
            <label className="inline-field">
              {tr('set.balancePct')}
              <input
                className="cell-input num"
                type="number"
                min={0}
                step={5}
                value={settings.balanceMaxExtraPct ?? 10}
                onChange={(e) => set('balanceMaxExtraPct', Number(e.target.value))}
              />
              <span className="unit">%</span>
            </label>
          )}
          <p className="hint">
            {objective === 'km' ? tr('set.objectiveKmHelp') : tr('set.objectiveBalancedHelp', { pct: settings.balanceMaxExtraPct ?? 10 })}
          </p>
        </div>

        <div className="mode">
          <span className="mode-label">{tr('set.limitWhat')}</span>
          <Segmented<TimeLimitMode>
            label={tr('set.limitWhat')}
            value={settings.timeLimitMode}
            options={modes}
            onChange={(v) => set('timeLimitMode', v)}
          />
          <p className="hint">{active.help}</p>
        </div>

        {geo && (
          <div className="mode">
            <span className="mode-label">{tr('set.distances')}</span>
            <Segmented
              label={tr('set.distances')}
              value={settings.distanceSource}
              options={[
                { value: 'road', label: tr('set.distRoad') },
                { value: 'air', label: tr('set.distAir') },
              ]}
              onChange={(v) => set('distanceSource', v)}
            />
            <p className="hint">
              {settings.distanceSource === 'road' ? tr('set.distRoadHelp') : tr('set.distAirHelp', { f: settings.roadFactor })}
            </p>
          </div>
        )}

        {geo && settings.distanceSource === 'road' && (
          <div className="mode">
            <span className="mode-label">{tr('set.travelTime')}</span>
            <Segmented<TravelTimeSource>
              label={tr('set.travelTime')}
              value={settings.travelTimeSource ?? 'road'}
              options={[
                { value: 'road', label: tr('set.timeRoad') },
                { value: 'speed', label: tr('set.timeSpeed') },
              ]}
              onChange={(v) => set('travelTimeSource', v)}
            />
            <p className="hint">
              {roadTimes
                ? tr('set.timeRoadHelp', { vmax: settings.truckMaxSpeedKmh ?? 80 })
                : tr('set.timeSpeedHelp', { v: settings.speedKmh })}
            </p>
          </div>
        )}
        {!geo && <p className="hint">{tr('set.xySpeedNote', { v: settings.speedKmh })}</p>}

        <div className="mode">
          <span className="mode-label">{tr('set.solver')}</span>
          <Segmented<SolverMode>
            label={tr('set.solver')}
            value={settings.solverMode}
            options={[
              { value: 'auto', label: tr('set.solverAutoLabel') },
              {
                value: 'exact',
                label: tr('set.solverExactLabel'),
                title: exactBlocked ? tr('set.solverMaxTitle', { max: MAX_EXACT_ORDERS }) : undefined,
              },
              { value: 'heuristic', label: tr('set.solverHeuristicLabel') },
            ]}
            disabled={(v) => v === 'exact' && exactBlocked && settings.solverMode !== 'exact'}
            onChange={(v) => set('solverMode', v)}
          />
          <p className={`hint ${settings.solverMode === 'exact' && exactBlocked ? 'warn-text' : ''}`}>
            {solverHelp(settings.solverMode, orderCount)}
          </p>
        </div>
      </div>
    </div>
  )
}
