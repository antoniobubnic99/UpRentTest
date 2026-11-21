import type ExcelJSType from 'exceljs'
import { getLang, tr } from '../i18n'
import type { ProblemInput } from '../solver/types'
import {
  COLUMNS,
  ImportError,
  LANG_INDEX,
  headerOf,
  importSections,
  locationRows,
  orderRows,
  sectionOf,
  templateRows,
  truckRows,
  type CsvKind,
  type CsvRow,
  type Section,
} from './io'

/**
 * Excel (.xlsx) import / export: one sheet per section (Vozila, Lokacije, Nalozi), each an
 * Excel table with a styled header, column widths, number formats and input checks; pickup
 * and delivery are drop-down lists of the location ids. Sheet and column names follow the
 * current language and are accepted in all four on import. The library is loaded only when
 * Excel is used, so it does not slow down the first page load.
 */

type Cell = string | number | undefined

const SHEET_NAMES: Record<Section, [string, string, string, string]> = {
  trucks: ['Vozila', 'Vehicles', 'Véhicules', 'Fahrzeuge'],
  locations: ['Lokacije', 'Locations', 'Lieux', 'Standorte'],
  orders: ['Nalozi', 'Orders', 'Ordres', 'Aufträge'],
}
const SECTIONS: Section[] = ['trucks', 'locations', 'orders']
/** Data validations and drop-downs cover this many rows. */
const ROWS = 500

const WIDTH: Record<string, number> = {
  id: 8,
  naziv: 26,
  nosivost_kg: 15,
  max_strojeva: 15,
  x_km: 9,
  y_km: 9,
  lat: 12,
  lon: 12,
  adresa: 40,
  baza: 9,
  nalog: 10,
  stroj: 10,
  tezina_kg: 13,
  preuzimanje: 16,
  isporuka: 16,
  utovar_min: 13,
  istovar_min: 13,
}
const FORMAT: Record<string, string> = {
  nosivost_kg: '#,##0',
  tezina_kg: '#,##0',
  lat: '0.00000',
  lon: '0.00000',
}

async function loadExcel(): Promise<typeof ExcelJSType> {
  const mod = (await import('exceljs')) as unknown as { default?: typeof ExcelJSType } & typeof ExcelJSType
  return mod.default ?? mod
}

const colLetter = (i: number) => String.fromCharCode(65 + i)
const quoted = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`

async function buildWorkbook(sections: Record<Section, Cell[][]>): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'UP RENT Smart Logistics Planner'
  wb.created = new Date()
  const li = LANG_INDEX[getLang()]
  const sheetName = (s: Section) => SHEET_NAMES[s][li]
  const yes = tr('csv.yes')

  for (const section of SECTIONS) {
    const ws = wb.addWorksheet(sheetName(section), {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' },
      properties: { tabColor: { argb: section === 'trucks' ? 'FFFFFF00' : section === 'locations' ? 'FF4B5563' : 'FF000000' } },
    })
    const ids = COLUMNS[section].map((c) => c[0])
    const header = headerOf(section)
    const rows = sections[section].length ? sections[section] : [ids.map(() => undefined)]
    ws.addTable({
      name: `T_${section}`,
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium1', showRowStripes: true },
      columns: header.map((name) => ({ name, filterButton: true })),
      rows: rows.map((r) => r.map((v) => (v === undefined || v === '' ? null : v))),
    })
    ids.forEach((id, i) => {
      const col = ws.getColumn(i + 1)
      col.width = Math.max(WIDTH[id] ?? 12, header[i].length + 4)
      if (FORMAT[id]) col.numFmt = FORMAT[id]
    })
    // Up Rent look for the header: black with yellow text
    ws.getRow(1).eachCell((c) => {
      c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFF00' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }
      c.alignment = { vertical: 'middle' }
    })
    ws.getRow(1).height = 20
    // thin grid on the data rows, so the table also reads well where table styles are not shown
    const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
    for (let r = 2; r <= rows.length + 1; r++)
      for (let c = 1; c <= ids.length; c++) ws.getCell(r, c).border = { top: thin, left: thin, bottom: thin, right: thin }

    const at = (id: string) => colLetter(ids.indexOf(id))
    const validate = (id: string, v: ExcelJSType.DataValidation) => {
      const c = at(id)
      for (let r = 2; r <= ROWS; r++) ws.getCell(`${c}${r}`).dataValidation = v
    }
    const positive: ExcelJSType.DataValidation = {
      type: 'decimal',
      operator: 'greaterThan',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      error: tr('csv.capacity'),
    }
    if (section === 'trucks') {
      validate('nosivost_kg', positive)
      validate('max_strojeva', {
        type: 'whole',
        operator: 'greaterThanOrEqual',
        formulae: [1],
        allowBlank: true,
        showErrorMessage: true,
        error: tr('csv.maxItems'),
      })
    }
    if (section === 'locations') {
      validate('baza', { type: 'list', formulae: [`"${yes}"`], allowBlank: true })
    }
    if (section === 'orders') {
      validate('tezina_kg', { ...positive, error: tr('csv.weight') })
      const locIds = `${quoted(sheetName('locations'))}!$A$2:$A$${ROWS}`
      for (const id of ['preuzimanje', 'isporuka'])
        validate(id, { type: 'list', formulae: [locIds], allowBlank: true, showErrorMessage: true, error: tr('csv.noPosition') })
      for (const id of ['utovar_min', 'istovar_min'])
        validate(id, {
          type: 'decimal',
          operator: 'greaterThanOrEqual',
          formulae: [0],
          allowBlank: true,
          showErrorMessage: true,
          error: tr('csv.minutes', { col: header[ids.indexOf(id)] }),
        })
    }
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

/** Template with example rows, in the current language. */
export function templateXlsx(): Promise<ArrayBuffer> {
  const ex = templateRows()
  return buildWorkbook({ trucks: ex.trucks, locations: ex.locations, orders: ex.orders })
}

/** The whole data set (vehicles, locations, orders) as an Excel workbook. */
export function exportXlsx(input: ProblemInput): Promise<ArrayBuffer> {
  return buildWorkbook({
    trucks: truckRows(input),
    locations: locationRows(input, tr('csv.yes')),
    orders: orderRows(input),
  })
}

/** Plain text of an Excel cell value (numbers, text, rich text, formula results, links). */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.result !== undefined) return cellText(o.result)
    if (o.text !== undefined) return cellText(o.text)
  }
  return String(v)
}

/**
 * Imports a workbook: each recognised sheet (any language) replaces that part of the data;
 * other sheets are ignored. Problems are reported with the sheet name and row number.
 */
export async function importXlsx(
  input: ProblemInput,
  data: ArrayBuffer,
): Promise<{ input: ProblemInput; toGeocode: string[]; sections: CsvKind[] }> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(data)
  } catch {
    throw new ImportError([tr('xlsx.bad')])
  }
  const parts = new Map<Section, CsvRow[]>()
  wb.eachSheet((ws) => {
    const section = sectionOf(ws.name)
    if (!section || parts.has(section)) return
    const rows: CsvRow[] = []
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const values = row.values as unknown[]
      const cells = values.slice(1).map(cellText)
      if (cells.some((c) => c.trim() !== '')) rows.push({ line: n, sheet: ws.name, cells })
    })
    parts.set(section, rows)
  })
  if (parts.size === 0) throw new ImportError([tr('xlsx.noSheets')])
  return importSections(input, parts)
}
