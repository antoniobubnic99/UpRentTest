import { describe, expect, it } from 'vitest'
import { cloneDefaultInput } from '../data/defaultData'
import { compareScenarios, currentScenario, scenarioSettings } from './scenarios'

describe('scenario comparison', () => {
  const scenarios = compareScenarios(cloneDefaultInput())
  const [none, limit, brk] = scenarios

  it('task data: 182.2 km without limit, 200.1 km with 9 h, 217.0 km with the break', () => {
    expect(scenarios.map((s) => s.key)).toEqual(['none', 'limit', 'limit+break'])
    expect(none.plan.totalKm).toBe(182.2)
    expect(limit.plan.totalKm).toBe(200.1)
    expect(brk.plan.totalKm).toBe(217)
    expect(limit.deltaKm).toBe(17.9)
    expect(brk.deltaKm).toBe(16.9)
    for (const s of scenarios) {
      expect(s.violations).toEqual([])
      expect(s.plan.ordersCompleted).toBe(10)
    }
  })

  it('explains why the shortest plan is not feasible: truck B would work 9 h 42 min', () => {
    expect(none.explanation.join(' ')).toContain('Kamion B bi radio 9 h 42 min')
  })

  it('explains which orders move between trucks and what the limit costs', () => {
    const l = limit.explanation.join(' ')
    expect(l).toContain('N03 prelazi na Kamion A')
    expect(l).toContain('+17,9 km')
    const b = brk.explanation.join(' ')
    expect(b).toContain('30 min pauze')
    expect(b).toContain('N01, N04 prelaze na Kamion A')
    expect(b).toContain('N03 prelazi na Kamion B')
  })

  it('does not change the input settings', () => {
    const input = cloneDefaultInput()
    const before = structuredClone(input.settings)
    compareScenarios(input)
    expect(input.settings).toEqual(before)
  })

  it('maps current settings to a scenario', () => {
    const s = cloneDefaultInput().settings
    expect(currentScenario(s)).toBe('limit')
    expect(currentScenario({ ...s, breakEnabled: true })).toBe('limit+break')
    expect(currentScenario({ ...s, timeLimitMode: 'none' })).toBe('none')
    expect(currentScenario({ ...s, timeLimitMode: 'drive' })).toBeNull()
    expect(scenarioSettings({ ...s, breakMinutes: 0 })['limit+break'].breakMinutes).toBe(30)
  })
})
