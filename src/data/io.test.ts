import { describe, expect, it } from 'vitest'
import { solve } from '../solver/solver'
import { checkInput } from '../solver/validateInput'
import { cloneDefaultInput, geoExampleInput } from './defaultData'
import {
  CSV_HEADER,
  ImportError,
  decodeShare,
  encodeShare,
  exportJson,
  exportOrdersCsv,
  importJson,
  importOrdersCsv,
  parseCsv,
  shareTokenFromHash,
  shareUrl,
} from './io'

describe('JSON import / export', () => {
  it('round trip keeps the data set and the result (200.1 km)', () => {
    const input = cloneDefaultInput()
    input.orders[8].pickupMinutes = 60
    const back = importJson(exportJson(input))
    expect(back).toEqual(input)
    expect(solve(back).totalKm).toBe(217)
  })

  it('round trip in geo mode keeps lat/lon and address', () => {
    const input = geoExampleInput()
    input.locations[1].address = 'Zaprešić, Hrvatska'
    expect(importJson(exportJson(input))).toEqual(input)
  })

  it('accepts a bare data object and fills missing settings with defaults', () => {
    const input = cloneDefaultInput()
    const { settings: _settings, ...rest } = input
    void _settings
    const back = importJson(JSON.stringify(rest))
    expect(back.settings).toEqual(input.settings)
    expect(checkInput(back)).toEqual([])
  })

  it('rejects invalid JSON, foreign formats and wrong structure with clear messages', () => {
    expect(() => importJson('{nije json')).toThrow(ImportError)
    expect(() => importJson(JSON.stringify({ format: 'nesto-drugo', data: {} }))).toThrow('Nepoznat format')
    expect(() => importJson(JSON.stringify({ trucks: 'A' }))).toThrow('mora biti lista')
    expect(() => importJson('42')).toThrow(ImportError)
  })

  it('bad values survive as NaN and are then reported by the normal input check', () => {
    const back = importJson(JSON.stringify({ ...cloneDefaultInput(), trucks: [{ id: 'A', name: 'A', capacityKg: 'puno', maxItems: 2 }] }))
    expect(checkInput(back).join(' ')).toContain('nosivost')
  })
})

describe('CSV of orders', () => {
  it('exports with ";" and the documented header', () => {
    const csv = exportOrdersCsv(cloneDefaultInput())
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(CSV_HEADER)
    expect(rows[1]).toEqual(['N01', 'M01', '800', 'L1', 'L3', '', ''])
    expect(rows).toHaveLength(11)
  })

  it('round trip: export -> import gives the same orders and machines', () => {
    const input = cloneDefaultInput()
    input.orders[2].deliveryMinutes = 45
    const back = importOrdersCsv({ ...input, orders: [], machines: [] }, exportOrdersCsv(input))
    expect(back.orders).toEqual(input.orders)
    expect(back.machines).toEqual(input.machines)
  })

  it('reads Excel-style input: BOM, decimal comma, quotes, comma separator', () => {
    const input = cloneDefaultInput()
    const csv = '﻿nalog,stroj,tezina_kg,preuzimanje,isporuka,utovar_min\r\nX1,"MX ""teški""",1500,L1,L2,"7,5"\r\n'
    const back = importOrdersCsv(input, csv)
    expect(back.orders).toEqual([{ id: 'X1', machineId: 'MX "teški"', pickupId: 'L1', deliveryId: 'L2', pickupMinutes: 7.5 }])
    expect(back.machines).toEqual([{ id: 'MX "teški"', weightKg: 1500 }])
  })

  it('reports every bad row with its row number and changes nothing', () => {
    const input = cloneDefaultInput()
    const csv = 'nalog;stroj;tezina_kg;preuzimanje;isporuka\nA1;M1;0;L1;L2\nA2;M2;900;L1;L99\n'
    try {
      importOrdersCsv(input, csv)
      expect.unreachable()
    } catch (e) {
      const p = (e as ImportError).problems
      expect(p).toEqual([
        'Red 2: težina mora biti broj veći od 0.',
        'Red 3: lokacija isporuke "L99" ne postoji.',
      ])
    }
    expect(() => importOrdersCsv(input, 'a;b\n1;2')).toThrow('CSV nema stupce')
  })
})

describe('share link', () => {
  it('encodes into a compact URL fragment and decodes to the same data', async () => {
    const input = cloneDefaultInput()
    const token = await encodeShare(input)
    expect(token.startsWith('z.')).toBe(true)
    expect(token).toMatch(/^z\.[A-Za-z0-9_-]+$/)
    expect(token.length).toBeLessThan(1500)
    expect(await decodeShare(token)).toEqual(input)
  })

  it('builds the URL and reads the token back from the hash', async () => {
    const url = await shareUrl(cloneDefaultInput(), 'https://uprenttest.vercel.app/#stari')
    expect(url.startsWith('https://uprenttest.vercel.app/#d=z.')).toBe(true)
    const token = shareTokenFromHash(new URL(url).hash)
    expect(token).not.toBeNull()
    expect((await decodeShare(token!)).orders).toHaveLength(10)
    expect(shareTokenFromHash('#nesto')).toBeNull()
  })

  it('a damaged link gives a clear error', async () => {
    await expect(decodeShare('z.nijeispravno')).rejects.toThrow('Link je oštećen')
    await expect(decodeShare('x.abc')).rejects.toThrow(ImportError)
  })
})
