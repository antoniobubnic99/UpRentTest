import { solve } from './solver'
import type { Plan, ProblemInput, Settings } from './types'
import { validatePlan } from './validatePlan'

/**
 * Side-by-side comparison of how the interpretation of the daily limit changes the plan
 * for the same data: no limit, the 9 h working day, and the 9 h day with a mandatory break.
 * Each scenario is solved independently and checked by the validator; the explanations are
 * generated from the plans themselves (which orders moved, which truck would exceed the day).
 */

export type ScenarioKey = 'none' | 'limit' | 'limit+break'

export interface Scenario {
  key: ScenarioKey
  label: string
  settings: Settings
  plan: Plan
  violations: string[]
  /** km difference to the previous (less constrained) scenario */
  deltaKm: number | null
  explanation: string[]
}

const hoursText = (h: number) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

const kmText = (km: number) => `${km.toLocaleString('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`

/** Order id -> truck name in a plan. */
function owners(plan: Plan): Map<string, string> {
  const m = new Map<string, string>()
  for (const tp of plan.trucks) for (const id of tp.orderIds) m.set(id, tp.truck.name)
  return m
}

/** Human-readable list of orders that changed truck between two plans. */
function moves(before: Plan, after: Plan): string[] {
  const a = owners(before)
  const b = owners(after)
  const byTarget = new Map<string, string[]>()
  for (const [id, truck] of b) {
    if (a.get(id) !== truck) byTarget.set(truck, [...(byTarget.get(truck) ?? []), id])
  }
  return [...byTarget].map(([truck, ids]) => `${ids.join(', ')} ${ids.length === 1 ? 'prelazi' : 'prelaze'} na ${truck}`)
}

export function scenarioSettings(base: Settings): Record<ScenarioKey, Settings> {
  const breakMinutes = base.breakMinutes > 0 ? base.breakMinutes : 30
  return {
    none: { ...base, timeLimitMode: 'none', breakEnabled: false },
    limit: { ...base, timeLimitMode: 'drive+handling', breakEnabled: false },
    'limit+break': { ...base, timeLimitMode: 'drive+handling', breakEnabled: true, breakMinutes },
  }
}

/** Which scenario the current settings correspond to (null if none of them). */
export function currentScenario(s: Settings): ScenarioKey | null {
  if (s.timeLimitMode === 'none') return 'none'
  if (s.timeLimitMode === 'drive+handling') return s.breakEnabled ? 'limit+break' : 'limit'
  return null
}

export function compareScenarios(input: ProblemInput): Scenario[] {
  const settings = scenarioSettings(input.settings)
  const limit = input.settings.maxHoursPerDay
  const labels: Record<ScenarioKey, string> = {
    none: 'Bez limita',
    limit: `Limit ${limit} h (vožnja + utovar/istovar)`,
    'limit+break': `Limit ${limit} h + pauza ${settings['limit+break'].breakMinutes} min`,
  }

  const keys: ScenarioKey[] = ['none', 'limit', 'limit+break']
  const result: Scenario[] = []
  for (const key of keys) {
    const scenarioInput = { ...input, settings: settings[key] }
    const plan = solve(scenarioInput)
    const prev = result[result.length - 1]
    const explanation: string[] = []

    if (key === 'none') {
      explanation.push('Najkraće moguće rješenje: radno vrijeme se ne ograničava.')
      for (const tp of plan.trucks) {
        if (tp.totalHours > limit + 1e-9)
          explanation.push(
            `${tp.truck.name} bi radio ${hoursText(tp.totalHours)} (vožnja + utovar/istovar), više od radnog dana od ${limit} h, pa ovaj plan u praksi nije izvediv.`,
          )
      }
    } else if (prev) {
      const what =
        key === 'limit'
          ? `Radni dan vozača ograničen je na ${limit} h (vožnja + ${input.settings.handlingMinutes} min po utovaru/istovaru).`
          : `Svako vozilo s nalozima dobiva ${settings[key].breakMinutes} min pauze, pa u dan stane manje posla.`
      explanation.push(what)
      const moved = moves(prev.plan, plan)
      if (moved.length) explanation.push(`Promjena rasporeda: ${moved.join('; ')}.`)
      const d = Math.round((plan.totalKm - prev.plan.totalKm) * 10) / 10
      if (d > 0) explanation.push(`Cijena ograničenja: +${kmText(d)} u odnosu na prethodni scenarij.`)
      else if (d === 0 && !moved.length) explanation.push('Raspored se ne mijenja: ograničenje ovdje nije aktivno.')
      const lost = prev.plan.ordersCompleted - plan.ordersCompleted
      if (lost > 0) explanation.push(`${lost} ${lost === 1 ? 'nalog više ne stane' : 'naloga više ne stane'} u radni dan.`)
      const busiest = [...plan.trucks].sort((a, b) => b.totalHours - a.totalHours)[0]
      if (busiest && busiest.ordersCompleted > 0)
        explanation.push(`Najopterećenije vozilo: ${busiest.truck.name}, ${hoursText(busiest.totalHours)} od ${limit} h.`)
    }

    result.push({
      key,
      label: labels[key],
      settings: settings[key],
      plan,
      violations: validatePlan(scenarioInput, plan),
      deltaKm: prev ? Math.round((plan.totalKm - prev.plan.totalKm) * 10) / 10 : null,
      explanation,
    })
  }
  return result
}
