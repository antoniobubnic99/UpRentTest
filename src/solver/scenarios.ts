import { locale, tr } from '../i18n'
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

const kmText = (km: number) => `${km.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`

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
  return [...byTarget].map(([truck, ids]) => tr('sc.moves', { ids: ids.join(', '), n: ids.length, truck }))
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
    none: tr('set.limitNone'),
    limit: tr('sc.limit', { h: limit }),
    'limit+break': tr('sc.limitBreak', { h: limit, min: settings['limit+break'].breakMinutes }),
  }

  const keys: ScenarioKey[] = ['none', 'limit', 'limit+break']
  const result: Scenario[] = []
  for (const key of keys) {
    const scenarioInput = { ...input, settings: settings[key] }
    const plan = solve(scenarioInput)
    const prev = result[result.length - 1]
    const explanation: string[] = []

    if (key === 'none') {
      explanation.push(tr('sc.noneWhy'))
      for (const tp of plan.trucks) {
        if (tp.totalHours > limit + 1e-9)
          explanation.push(tr('sc.wouldWork', { name: tp.truck.name, h: hoursText(tp.totalHours), limit }))
      }
    } else if (prev) {
      const what =
        key === 'limit'
          ? tr('sc.limitWhy', { limit, min: input.settings.handlingMinutes })
          : tr('sc.breakWhy', { min: settings[key].breakMinutes })
      explanation.push(what)
      const moved = moves(prev.plan, plan)
      if (moved.length) explanation.push(tr('sc.changed', { list: moved.join('; ') }))
      const d = Math.round((plan.totalKm - prev.plan.totalKm) * 10) / 10
      if (d > 0) explanation.push(tr('sc.cost', { km: kmText(d) }))
      else if (d === 0 && !moved.length) explanation.push(tr('sc.same'))
      const lost = prev.plan.ordersCompleted - plan.ordersCompleted
      if (lost > 0) explanation.push(tr('sc.lost', { n: lost }))
      const busiest = [...plan.trucks].sort((a, b) => b.totalHours - a.totalHours)[0]
      if (busiest && busiest.ordersCompleted > 0)
        explanation.push(tr('sc.busiest', { name: busiest.truck.name, h: hoursText(busiest.totalHours), limit }))
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

export interface BalanceSuggestion {
  /** least used truck in the current plan and its working hours */
  idle: { name: string; hours: number }
  plan: Plan
  settings: Settings
  deltaKm: number
  /** orders that change truck: truck name -> order ids */
  moves: { truck: string; orderIds: string[] }[]
}

/**
 * "Kamion A je slabo iskorišten…": when the current plan minimises km and one truck works
 * much less than the busiest one, solve again with the even-workload objective (default
 * +10 % km) and return the alternative if it really shortens the longest day.
 * Exact solver only (small instances), so the suggestion is cheap and reliable.
 */
export function balanceSuggestion(input: ProblemInput, plan: Plan): BalanceSuggestion | null {
  if ((input.settings.objective ?? 'km') !== 'km' || plan.solverUsed !== 'exact' || plan.trucks.length < 2) return null
  const longest = Math.max(...plan.trucks.map((t) => t.totalHours))
  const idle = [...plan.trucks].sort((a, b) => a.totalHours - b.totalHours)[0]
  if (longest <= 0 || idle.totalHours > longest * 0.5) return null
  const settings: Settings = { ...input.settings, objective: 'balanced', balanceMaxExtraPct: input.settings.balanceMaxExtraPct ?? 10 }
  const alt = solve({ ...input, settings })
  const altLongest = Math.max(...alt.trucks.map((t) => t.totalHours))
  if (alt.ordersCompleted < plan.ordersCompleted || altLongest >= longest - 1 / 60) return null
  const a = owners(plan)
  const byTruck = new Map<string, string[]>()
  for (const [id, truck] of owners(alt)) if (a.get(id) !== truck) byTruck.set(truck, [...(byTruck.get(truck) ?? []), id])
  return {
    idle: { name: idle.truck.name, hours: idle.totalHours },
    plan: alt,
    settings,
    deltaKm: Math.round((alt.totalKm - plan.totalKm) * 10) / 10,
    moves: [...byTruck].map(([truck, orderIds]) => ({ truck, orderIds })),
  }
}
