import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'
import { setLang } from '../i18n'
import { solve } from '../solver/solver'
import { cloneDefaultInput, emptyInput, geoExampleInput } from './defaultData'
import { ImportError } from './io'
import { exportXlsx, importXlsx, templateXlsx } from './xlsx'

const problemsOf = async (p: Promise<unknown>): Promise<string[]> => {
  try {
    await p
    return []
  } catch (e) {
    if (e instanceof ImportError) return e.problems
    throw e
  }
}

async function open(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

describe('Excel: one sheet per section, formatted as tables', () => {
  afterEach(() => setLang('hr'))

  it('the template has the sheets Vozila, Lokacije, Nalozi, each an Excel table with a drop-down for locations', async () => {
    const wb = await open(await templateXlsx())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Vozila', 'Lokacije', 'Nalozi'])
    for (const ws of wb.worksheets) expect(ws.getTables()).toHaveLength(1)
    const orders = wb.getWorksheet('Nalozi')!
    expect(orders.getRow(1).values).toEqual([undefined, 'nalog', 'stroj', 'tezina_kg', 'preuzimanje', 'isporuka', 'utovar_min', 'istovar_min'])
    expect(orders.getCell('D2').dataValidation).toMatchObject({ type: 'list', formulae: ["'Lokacije'!$A$2:$A$500"] })
    expect(wb.getWorksheet('Lokacije')!.getCell('H2').value).toBe('da')
  })

  it('the template imports into a valid data set', async () => {
    const r = await importXlsx(emptyInput(), await templateXlsx())
    expect(r.sections).toEqual(['trucks', 'locations', 'orders'])
    expect(r.input.trucks).toHaveLength(2)
    expect(r.input.orders).toHaveLength(2)
    expect(r.input.baseId).toBe('L0')
    expect(r.toGeocode).toEqual(['L0', 'L1'])
  })

  it('task data: export -> import round trip gives 200,1 km; numbers stay numbers in Excel', async () => {
    const input = cloneDefaultInput()
    const buf = await exportXlsx(input)
    const wb = await open(buf)
    expect(wb.getWorksheet('Vozila')!.getCell('C3').value).toBe(10000)
    const back = (await importXlsx(emptyInput(), buf)).input
    expect(back.trucks).toEqual(input.trucks)
    expect(back.locations).toEqual(input.locations)
    expect(back.orders).toEqual(input.orders)
    expect(solve(back).totalKm).toBe(200.1)
  })

  it('real-map data keeps coordinates and the base', async () => {
    const input = geoExampleInput()
    const back = (await importXlsx(emptyInput('geo'), await exportXlsx(input))).input
    expect(back.locations).toEqual(input.locations)
    expect(back.baseId).toBe(input.baseId)
  })

  it('workbooks saved in English, French or German import too', async () => {
    for (const lang of ['en', 'fr', 'de'] as const) {
      setLang(lang)
      const buf = await exportXlsx(cloneDefaultInput())
      setLang('hr')
      expect(solve((await importXlsx(emptyInput(), buf)).input).totalKm).toBe(200.1)
    }
    setLang('de')
    expect((await open(await templateXlsx())).worksheets.map((w) => w.name)).toEqual(['Fahrzeuge', 'Standorte', 'Aufträge'])
  })

  it('errors name the sheet and the row; unknown sheets are ignored; a missing sheet keeps the data', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Upute').addRow(['bilo što'])
    const o = wb.addWorksheet('Nalozi')
    o.addRow(['nalog', 'stroj', 'tezina_kg', 'preuzimanje', 'isporuka'])
    o.addRow(['N1', 'M1', 0, 'L1', 'L2'])
    o.addRow(['N2', 'M2', 500, 'L1', 'L1'])
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    expect(await problemsOf(importXlsx(cloneDefaultInput(), buf))).toEqual([
      'List Nalozi, red 2: težina mora biti broj veći od 0.',
      'List Nalozi, red 3: preuzimanje i isporuka su na istoj lokaciji (L1).',
    ])
    const ok = new ExcelJS.Workbook()
    const v = ok.addWorksheet('Vozila')
    v.addRow(['id', 'naziv', 'nosivost_kg', 'max_strojeva'])
    v.addRow(['K', 'Kombi', 1500, 1])
    const r = await importXlsx(cloneDefaultInput(), (await ok.xlsx.writeBuffer()) as ArrayBuffer)
    expect(r.input.trucks).toEqual([{ id: 'K', name: 'Kombi', capacityKg: 1500, maxItems: 1 }])
    expect(r.input.orders).toEqual(cloneDefaultInput().orders)
  })

  it('rejects files that are not Excel or have no known sheet', async () => {
    expect(await problemsOf(importXlsx(emptyInput(), new TextEncoder().encode('id;naziv').buffer))).toEqual([
      'Datoteka nije ispravna Excel datoteka (.xlsx).',
    ])
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Sheet1').addRow(['x'])
    expect((await problemsOf(importXlsx(emptyInput(), (await wb.xlsx.writeBuffer()) as ArrayBuffer)))[0]).toContain('nema nijedan od listova')
  })
})
