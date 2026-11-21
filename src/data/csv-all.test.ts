import { afterEach, describe, expect, it } from 'vitest'
import { setLang } from '../i18n'
import { solve } from '../solver/solver'
import { checkInput } from '../solver/validateInput'
import { cloneDefaultInput, emptyInput, geoExampleInput } from './defaultData'
import { ImportError, exportAllCsv, importAllCsv, templateAllCsv } from './io'

const problemsOf = (fn: () => unknown): string[] => {
  try {
    fn()
    return []
  } catch (e) {
    if (e instanceof ImportError) return e.problems
    throw e
  }
}

describe('one CSV with vehicles, locations and orders', () => {
  afterEach(() => setLang('hr'))

  it('the template has three sections and imports into a valid data set', () => {
    const csv = templateAllCsv()
    expect(csv).toMatch(/^#VOZILA\r\nid;naziv;nosivost_kg;max_strojeva\r\n/)
    expect(csv).toContain('#LOKACIJE\r\nid;naziv;x_km;y_km;lat;lon;adresa;baza')
    expect(csv).toContain('#NALOZI\r\nnalog;stroj;tezina_kg;preuzimanje;isporuka;utovar_min;istovar_min')
    const r = importAllCsv(emptyInput(), csv)
    expect(r.sections).toEqual(['trucks', 'locations', 'orders'])
    expect(r.input.trucks).toHaveLength(2)
    expect(r.input.orders).toHaveLength(2)
    expect(r.input.baseId).toBe('L0')
    expect(r.toGeocode).toEqual(['L0', 'L1']) // address only -> geocoded by the app
  })

  it('task data: export -> import round trip still gives 200,1 km', () => {
    const input = cloneDefaultInput()
    const back = importAllCsv(emptyInput(), exportAllCsv(input)).input
    expect(back.trucks).toEqual(input.trucks)
    expect(back.locations).toEqual(input.locations)
    expect(back.orders).toEqual(input.orders)
    expect(checkInput(back)).toEqual([])
    expect(solve(back).totalKm).toBe(200.1)
  })

  it('real-map data round trip keeps coordinates, addresses and the base', () => {
    const input = geoExampleInput()
    input.locations[1].address = 'Sesvete'
    const back = importAllCsv(emptyInput('geo'), exportAllCsv(input)).input
    expect(back.coordinateMode).toBe('geo')
    expect(back.locations).toEqual(input.locations)
    expect(back.baseId).toBe(input.baseId)
  })

  it('files in English, French or German import as well (headers and section names)', () => {
    for (const lang of ['en', 'fr', 'de'] as const) {
      setLang(lang)
      const csv = exportAllCsv(cloneDefaultInput())
      setLang('hr')
      const back = importAllCsv(emptyInput(), csv).input
      expect(solve(back).totalKm).toBe(200.1)
    }
    setLang('en')
    expect(templateAllCsv()).toContain('#ORDERS\r\norder;machine;weight_kg;pickup;delivery;loading_min;unloading_min')
    setLang('de')
    expect(templateAllCsv()).toContain('#FAHRZEUGE')
  })

  it('a missing section keeps the current data; orders are checked against the new locations', () => {
    const input = cloneDefaultInput()
    const onlyTrucks = '#VOZILA\nid;naziv;nosivost_kg;max_strojeva\nX;Kombi;1500;1\n'
    const r = importAllCsv(input, onlyTrucks)
    expect(r.input.trucks).toEqual([{ id: 'X', name: 'Kombi', capacityKg: 1500, maxItems: 1 }])
    expect(r.input.orders).toEqual(input.orders)

    const fewerLocations = '#LOKACIJE\nid;naziv;x_km;y_km;baza\nL0;Baza;0;0;da\nL1;A;3;8;\n'
    expect(problemsOf(() => importAllCsv(input, fewerLocations)).join(' ')).toContain('koriste lokacije kojih nema')
  })

  it('reports problems with the line number in the file and changes nothing', () => {
    const csv = [
      '#VOZILA',
      'id;naziv;nosivost_kg;max_strojeva',
      'A;A;0;2',
      '',
      '#LOKACIJE',
      'id;naziv;x_km;y_km;baza',
      'L0;Baza;0;0;da',
      'L1;A;3;8;',
      '#NALOZI',
      'nalog;stroj;tezina_kg;preuzimanje;isporuka',
      'N1;M1;500;L1;L1',
      'N2;M2;500;L1;L7',
    ].join('\n')
    expect(problemsOf(() => importAllCsv(emptyInput(), csv))).toEqual([
      'Red 3: nosivost mora biti broj veći od 0.',
      'Red 11: preuzimanje i isporuka su na istoj lokaciji (L1).',
      'Red 12: lokacija isporuke "L7" ne postoji.',
    ])
  })

  it('rejects files without sections, unknown or repeated sections', () => {
    expect(problemsOf(() => importAllCsv(emptyInput(), 'id;naziv\nA;B\n'))[0]).toContain('CSV mora imati sekcije')
    expect(problemsOf(() => importAllCsv(emptyInput(), '#KAMIONI\nid\n'))[0]).toContain('Red 1: nepoznata sekcija')
    expect(problemsOf(() => importAllCsv(emptyInput(), '#VOZILA\nid\n#VOZILA\nid\n'))[0]).toContain('dvaput')
  })
})

describe('import limits (a broken or hostile file must not freeze the browser)', () => {
  it('files over 5 MB are refused', async () => {
    const { checkFileSize, MAX_FILE_BYTES } = await import('./io')
    expect(() => checkFileSize(MAX_FILE_BYTES)).not.toThrow()
    expect(() => checkFileSize(MAX_FILE_BYTES + 1)).toThrow('Datoteka je prevelika')
  })

  it('more than 2000 rows in a section are refused (CSV and JSON)', async () => {
    const { MAX_ROWS, importJson } = await import('./io')
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `L${i};L${i};${i};0`).join('\n')
    expect(problemsOf(() => importAllCsv(emptyInput(), `#LOKACIJE\nid;naziv;x_km;y_km\n${rows}\n`))[0]).toContain(
      'Previše redaka (LOKACIJE: 2001)',
    )
    const big = JSON.stringify({ trucks: Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ id: `T${i}` })) })
    expect(() => importJson(big)).toThrow('Previše redaka')
  })
})
