import { useRef, useState } from 'react'
import { moveLocation } from '../data/edit'
import { geocode } from '../data/geocode'
import {
  ImportError,
  exportJson,
  exportLocationsCsv,
  exportOrdersCsv,
  exportTrucksCsv,
  importJson,
  importLocationsCsv,
  importOrdersCsv,
  importTrucksCsv,
  shareUrl,
  templateCsv,
  type CsvKind,
} from '../data/io'
import type { ProblemInput } from '../solver'

interface Props {
  input: ProblemInput
  onLoad: (next: ProblemInput) => void
}

function download(name: string, text: string, type: string) {
  // BOM so that Excel opens the CSV as UTF-8 (č, ć, š, ž)
  const blob = new Blob([type.includes('csv') ? '﻿' + text : text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Msg = { kind: 'ok' | 'error' | 'progress'; lines: string[] }
type FileKind = CsvKind | 'json'

const CSV_ROWS: { kind: CsvKind; label: string; file: string }[] = [
  { kind: 'trucks', label: 'Vozila', file: 'vozila' },
  { kind: 'locations', label: 'Lokacije', file: 'lokacije' },
  { kind: 'orders', label: 'Nalozi', file: 'nalozi' },
]

const stamp = () => new Date().toISOString().slice(0, 10)

/**
 * Import / export panel in the drawer: CSV templates and files for vehicles, locations and
 * orders (Excel), the whole data set as JSON, and a share link.
 */
export function DataIO({ input, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingKind, setPendingKind] = useState<FileKind>('orders')
  const empty = input.trucks.length + input.locations.length + input.orders.length === 0

  const pickFile = (kind: FileKind) => {
    setPendingKind(kind)
    // let the accept attribute update before opening the dialog
    setTimeout(() => fileRef.current?.click(), 0)
  }

  /** Looks up addresses of imported locations one by one (Nominatim allows 1 request/s). */
  const geocodeAll = async (start: ProblemInput, ids: string[]) => {
    let next = start
    const notFound: string[] = []
    for (const [i, id] of ids.entries()) {
      const loc = next.locations.find((l) => l.id === id)!
      setMsg({ kind: 'progress', lines: [`Tražim adrese ${i + 1}/${ids.length}: ${loc.address}`] })
      try {
        const [hit] = await geocode(loc.address ?? '', true)
        if (hit) next = moveLocation(next, id, Math.round(hit.lat * 1e5) / 1e5, Math.round(hit.lon * 1e5) / 1e5)
        else notFound.push(`${id} (${loc.address})`)
      } catch {
        notFound.push(`${id} (${loc.address})`)
      }
      onLoad(next)
    }
    return notFound
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    const kind = pendingKind
    try {
      const text = await file.text()
      if (kind === 'json') {
        const next = importJson(text)
        onLoad(next)
        setMsg({ kind: 'ok', lines: [`Učitano: ${next.trucks.length} vozila, ${next.locations.length} lokacija, ${next.orders.length} naloga.`] })
      } else if (kind === 'trucks') {
        const next = importTrucksCsv(input, text)
        onLoad(next)
        setMsg({ kind: 'ok', lines: [`Učitano ${next.trucks.length} vozila.`] })
      } else if (kind === 'orders') {
        const next = importOrdersCsv(input, text)
        onLoad(next)
        setMsg({ kind: 'ok', lines: [`Učitano ${next.orders.length} naloga.`] })
      } else {
        const { input: next, toGeocode } = importLocationsCsv(input, text)
        onLoad(next)
        const mode = next.coordinateMode === 'geo' ? 'stvarna karta' : 'koordinatni sustav'
        if (toGeocode.length === 0) {
          setMsg({ kind: 'ok', lines: [`Učitano ${next.locations.length} lokacija (${mode}), baza ${next.baseId}.`] })
          return
        }
        const notFound = await geocodeAll(next, toGeocode)
        setMsg({
          kind: notFound.length ? 'error' : 'ok',
          lines: [
            `Učitano ${next.locations.length} lokacija (${mode}), baza ${next.baseId}; adrese pronađene: ${toGeocode.length - notFound.length}/${toGeocode.length}.`,
            ...(notFound.length
              ? [`Nije pronađeno: ${notFound.join('; ')}. Upiši koordinate ručno ili klikni lokaciju na karti.`]
              : []),
          ],
        })
      }
    } catch (e) {
      setMsg({ kind: 'error', lines: e instanceof ImportError ? e.problems : [String(e)] })
    }
  }

  const exportCsv = (kind: CsvKind) =>
    kind === 'trucks' ? exportTrucksCsv(input) : kind === 'locations' ? exportLocationsCsv(input) : exportOrdersCsv(input)
  const hasData = (kind: CsvKind) =>
    (kind === 'trucks' ? input.trucks : kind === 'locations' ? input.locations : input.orders).length > 0

  const copyLink = async () => {
    try {
      const url = await shareUrl(input, window.location.href)
      await navigator.clipboard.writeText(url)
      window.history.replaceState(null, '', url)
      setMsg({
        kind: 'ok',
        lines: [
          `Link je kopiran (${url.length.toLocaleString('hr-HR')} znakova). Podaci su u samom linku; ništa se ne šalje na server.`,
        ],
      })
    } catch (e) {
      setMsg({ kind: 'error', lines: [`Link nije kopiran: ${e instanceof Error ? e.message : String(e)}`] })
    }
  }

  return (
    <div className="data-io">
      <button className="btn-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} Uvoz / izvoz / dijeljenje
      </button>
      {open && (
        <div className="data-io-panel">
          <p className="hint">
            Excel (CSV): preuzmi predložak, upiši podatke i učitaj ga. Redom: vozila, lokacije, nalozi. Lokacije mogu imati
            samo adresu, a koordinate se onda traže automatski.
          </p>
          {CSV_ROWS.map(({ kind, label, file }) => (
            <div className="data-io-row" key={kind}>
              <span className="data-io-label">{label} (CSV)</span>
              <button className="btn-outline small" onClick={() => download(`predlozak-${file}.csv`, templateCsv(kind), 'text/csv;charset=utf-8')}>
                Predložak
              </button>
              <button
                className="btn-outline small"
                disabled={!hasData(kind)}
                onClick={() => download(`uprent-${file}-${stamp()}.csv`, exportCsv(kind), 'text/csv;charset=utf-8')}
              >
                Preuzmi
              </button>
              <button className="btn-outline small" onClick={() => pickFile(kind)} aria-label={`Učitaj ${label.toLowerCase()} iz CSV-a`}>
                Učitaj…
              </button>
            </div>
          ))}
          <div className="data-io-row">
            <span className="data-io-label">Cijeli skup (JSON)</span>
            <button
              className="btn-outline small"
              disabled={empty}
              onClick={() => download(`uprent-podaci-${stamp()}.json`, exportJson(input), 'application/json')}
            >
              Preuzmi
            </button>
            <button className="btn-outline small" onClick={() => pickFile('json')} aria-label="Učitaj cijeli skup iz JSON-a">
              Učitaj…
            </button>
          </div>
          <div className="data-io-row">
            <span className="data-io-label">Link s podacima</span>
            <button className="btn-outline small" disabled={empty} onClick={copyLink}>
              Kopiraj link
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            data-kind={pendingKind}
            accept={pendingKind === 'json' ? '.json,application/json' : '.csv,text/csv,text/plain'}
            hidden
            onChange={(e) => {
              void readFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {msg && (
            <div className={`io-msg ${msg.kind}`} role="status">
              {msg.lines.slice(0, 6).map((l) => (
                <div key={l}>{l}</div>
              ))}
              {msg.lines.length > 6 && <div>… i još {msg.lines.length - 6}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
