import { afterEach, describe, expect, it } from 'vitest'
import { cloneDefaultInput, emptyInput } from '../data/defaultData'
import { solve } from '../solver/solver'
import { checkInput } from '../solver/validateInput'
import { de } from './de'
import { en } from './en'
import { fr } from './fr'
import { hr } from './hr'
import { LANGS, setLang, tr, type Catalog } from '.'

/** Sample parameters: every parameter name used by the catalogs gets a value. */
const sample = new Proxy({} as Record<string, unknown>, { get: (_t, k) => (k === 'n' ? 2 : `‹${String(k)}›`) })

const render = (c: Catalog, key: keyof Catalog): string => {
  const v = c[key] as string | ((p: unknown) => string)
  return typeof v === 'function' ? v(sample) : v
}

describe('translations (hr, en, fr, de)', () => {
  afterEach(() => setLang('hr'))

  const catalogs = { hr, en, fr, de } as Record<string, Catalog>
  const keys = Object.keys(hr) as (keyof Catalog)[]

  it('every language has every key, with a non-empty text that keeps all parameters', () => {
    for (const [lang, cat] of Object.entries(catalogs)) {
      expect(Object.keys(cat).sort(), lang).toEqual([...keys].sort())
      for (const key of keys) {
        const text = render(cat, key)
        expect(text.trim().length, `${lang} ${key}`).toBeGreaterThan(0)
        // a parameter shown in Croatian must also be shown in the translation
        for (const m of render(hr, key).matchAll(/‹(\w+)›/g)) expect(text, `${lang} ${key}`).toContain(m[0])
      }
    }
  })

  it('translations are really translated (not copies of the Croatian text)', () => {
    for (const lang of ['en', 'fr', 'de']) {
      const same = keys.filter((k) => render(catalogs[lang], k) === render(hr, k))
      // short technical labels may be identical (OK, Solver, Pause, Base, km/h ...)
      expect(same.length, `${lang}: ${same.join(', ')}`).toBeLessThan(keys.length * 0.06)
    }
  })

  it('the four languages are offered', () => {
    expect(LANGS.map((l) => l.id)).toEqual(['hr', 'en', 'fr', 'de'])
  })

  it('solver and validation messages follow the selected language', () => {
    setLang('en')
    expect(checkInput(emptyInput())).toContain('There are no orders.')
    setLang('de')
    expect(checkInput(emptyInput())).toContain('Es gibt keine Aufträge.')
    setLang('fr')
    const tight = cloneDefaultInput()
    tight.settings.maxHoursPerDay = 2
    const plan = solve(tight)
    expect(plan.unassigned[0].reason).toContain('limite journalière de 2 h')
    setLang('hr')
    expect(tr('tl.title')).toBe('Vremenska linija')
  })
})
