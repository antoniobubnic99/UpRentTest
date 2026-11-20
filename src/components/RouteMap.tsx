import type { Plan, ProblemInput } from '../solver'

interface Props {
  input: ProblemInput
  plan: Plan
  colors: string[]
}

const W = 640
const H = 440
const PAD = 36

export function RouteMap({ input, plan, colors }: Props) {
  const xs = input.locations.map((l) => l.x ?? 0)
  const ys = input.locations.map((l) => l.y ?? 0)
  const minX = Math.min(...xs) - 2
  const maxX = Math.max(...xs) + 2
  const minY = Math.min(...ys) - 2
  const maxY = Math.max(...ys) + 2
  const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY))
  const ox = (W - (maxX - minX) * scale) / 2
  const oy = (H - (maxY - minY) * scale) / 2
  const px = (x: number) => ox + (x - minX) * scale
  const py = (y: number) => H - oy - (y - minY) * scale // y axis points up
  const loc = new Map(input.locations.map((l) => [l.id, l]))

  const gridX: number[] = []
  for (let x = Math.ceil(minX / 5) * 5; x <= maxX; x += 5) gridX.push(x)
  const gridY: number[] = []
  for (let y = Math.ceil(minY / 5) * 5; y <= maxY; y += 5) gridY.push(y)

  return (
    <div className="card">
      <h3>Karta ruta</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="Karta lokacija i ruta kamiona">
        <defs>
          {colors.map((c, i) => (
            <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} stroke="#111" strokeWidth="1" />
            </marker>
          ))}
        </defs>

        {gridX.map((x) => (
          <line key={`gx${x}`} x1={px(x)} x2={px(x)} y1={py(minY)} y2={py(maxY)} className={x === 0 ? 'axis' : 'grid'} />
        ))}
        {gridY.map((y) => (
          <line key={`gy${y}`} y1={py(y)} y2={py(y)} x1={px(minX)} x2={px(maxX)} className={y === 0 ? 'axis' : 'grid'} />
        ))}

        {plan.trucks.map((tp, ti) => {
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
          <span key={tp.truck.id}>
            <span className="swatch" style={{ background: colors[i] }} /> {tp.truck.name}
          </span>
        ))}
        <span>
          <span className="swatch base" /> Baza {input.baseId}
        </span>
        <span className="muted">Mreža 5 km, udaljenosti su ravne linije (euklidske).</span>
      </div>
    </div>
  )
}
