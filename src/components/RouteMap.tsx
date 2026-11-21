import { truckColor } from '../colors'
import { fmtNum } from '../format'
import { tr } from '../i18n'
import type { Plan, ProblemInput } from '../solver'

interface Props {
  input: ProblemInput
  plan: Plan
  /** ids of trucks to draw (vehicle filter) */
  visible: Set<string>
}

const W = 640
const H = 460
const PAD = 44

export function RouteMap({ input, plan, visible }: Props) {
  const colors = plan.trucks.map((_, i) => truckColor(i))
  const xs = input.locations.map((l) => l.x ?? 0)
  const ys = input.locations.map((l) => l.y ?? 0)
  // Axis range on whole grid steps around the locations, so the axis numbers are round.
  const rawSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1)
  const step = rawSpan <= 12 ? 1 : rawSpan <= 30 ? 2 : rawSpan <= 70 ? 5 : rawSpan <= 150 ? 10 : 25
  const minX = Math.floor((Math.min(...xs) - step / 2) / step) * step
  const maxX = Math.ceil((Math.max(...xs) + step / 2) / step) * step
  const minY = Math.floor((Math.min(...ys) - step / 2) / step) * step
  const maxY = Math.ceil((Math.max(...ys) + step / 2) / step) * step
  const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY))
  const ox = (W - (maxX - minX) * scale) / 2
  const oy = (H - (maxY - minY) * scale) / 2
  const px = (x: number) => ox + (x - minX) * scale
  const py = (y: number) => H - oy - (y - minY) * scale // y axis points up
  const loc = new Map(input.locations.map((l) => [l.id, l]))

  const gridX: number[] = []
  for (let x = minX; x <= maxX + 1e-9; x += step) gridX.push(x)
  const gridY: number[] = []
  for (let y = minY; y <= maxY + 1e-9; y += step) gridY.push(y)
  // label every grid line unless they would be closer than ~26 px
  const labelEvery = Math.max(1, Math.ceil(26 / (step * scale)))

  return (
    <div className="card">
      <h3>{tr('map.titleXy')}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label={tr('map.aria')}>
        <defs>
          {colors.map((c, i) => (
            <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} stroke="#111" strokeWidth="1" />
            </marker>
          ))}
        </defs>

        {/* 1 km minor grid where there is room for it */}
        {step > 1 &&
          scale >= 6 &&
          Array.from({ length: Math.round(maxX - minX) + 1 }, (_, i) => minX + i)
            .filter((x) => x % step !== 0)
            .map((x) => <line key={`mx${x}`} x1={px(x)} x2={px(x)} y1={py(minY)} y2={py(maxY)} className="grid-minor" />)}
        {step > 1 &&
          scale >= 6 &&
          Array.from({ length: Math.round(maxY - minY) + 1 }, (_, i) => minY + i)
            .filter((y) => y % step !== 0)
            .map((y) => <line key={`my${y}`} y1={py(y)} y2={py(y)} x1={px(minX)} x2={px(maxX)} className="grid-minor" />)}
        {gridX.map((x) => (
          <line key={`gx${x}`} x1={px(x)} x2={px(x)} y1={py(minY)} y2={py(maxY)} className={x === 0 ? 'axis' : 'grid'} />
        ))}
        {gridY.map((y) => (
          <line key={`gy${y}`} y1={py(y)} y2={py(y)} x1={px(minX)} x2={px(maxX)} className={y === 0 ? 'axis' : 'grid'} />
        ))}

        {/* axis numbers (km) */}
        {gridX.map((x, i) =>
          i % labelEvery === 0 ? (
            <text key={`lx${x}`} x={px(x)} y={py(minY) + 15} className="axis-num" textAnchor="middle">
              {fmtNum(x)}
            </text>
          ) : null,
        )}
        {gridY.map((y, i) =>
          i % labelEvery === 0 ? (
            <text key={`ly${y}`} x={px(minX) - 7} y={py(y) + 4} className="axis-num" textAnchor="end">
              {fmtNum(y)}
            </text>
          ) : null,
        )}
        <text x={px(maxX)} y={py(minY) + 31} className="axis-title" textAnchor="end">
          X (km) →
        </text>
        <text x={px(minX) - 7} y={py(maxY) - 10} className="axis-title" textAnchor="start">
          ↑ Y (km)
        </text>

        {plan.trucks.map((tp, ti) => {
          if (!visible.has(tp.truck.id)) return null
          const offset = (ti - (plan.trucks.length - 1) / 2) * 3
          return tp.steps.slice(1).map((s, k) => {
            const a = loc.get(tp.steps[k].locationId)!
            const b = loc.get(s.locationId)!
            if (a.id === b.id) return null
            const x1 = px(a.x ?? 0)
            const y1 = py(a.y ?? 0)
            const x2 = px(b.x ?? 0)
            const y2 = py(b.y ?? 0)
            const len = Math.hypot(x2 - x1, y2 - y1)
            const nx = (-(y2 - y1) / len) * offset
            const ny = ((x2 - x1) / len) * offset
            // stop short of the node so the arrow head stays visible
            const shrink = 11 / len
            const ex = x2 - (x2 - x1) * shrink
            const ey = y2 - (y2 - y1) * shrink
            return (
              <g key={`${ti}-${k}`}>
                <line x1={x1 + nx} y1={y1 + ny} x2={ex + nx} y2={ey + ny} stroke="#111" strokeWidth={5} strokeLinecap="round" opacity={0.85} />
                <line
                  x1={x1 + nx}
                  y1={y1 + ny}
                  x2={ex + nx}
                  y2={ey + ny}
                  stroke={colors[ti]}
                  strokeWidth={3}
                  strokeLinecap="round"
                  markerEnd={`url(#arrow-${ti})`}
                />
              </g>
            )
          })
        })}

        {input.locations.map((l) => {
          const isBase = l.id === input.baseId
          return (
            <g key={l.id} transform={`translate(${px(l.x ?? 0)},${py(l.y ?? 0)})`}>
              {isBase ? (
                <rect x={-10} y={-10} width={20} height={20} className="node-base" />
              ) : (
                <circle r={8} className="node" />
              )}
              <text x={13} y={-9} className="node-label">
                {l.id}
              </text>
              <text x={13} y={4} className="node-coord">
                ({l.x}, {l.y})
              </text>
            </g>
          )
        })}
      </svg>
      <div className="legend">
        {plan.trucks.map((tp, i) => (
          <span key={tp.truck.id} className={visible.has(tp.truck.id) ? '' : 'off'}>
            <span className="swatch" style={{ background: colors[i] }} /> {tp.truck.name}
          </span>
        ))}
        <span>
          <span className="swatch base" /> {tr('data.base')} {input.baseId}
        </span>
        <span className="muted">{tr('map.gridNote', { step, minor: step > 1 && scale >= 6 ? 1 : 0 })}</span>
      </div>
    </div>
  )
}
