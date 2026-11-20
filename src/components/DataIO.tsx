import { useRef, useState } from 'react'
import { ImportError, exportJson, exportOrdersCsv, importJson, importOrdersCsv, shareUrl } from '../data/io'
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

type Msg = { kind: 'ok' | 'error'; lines: string[] }

/** Import / export panel in the drawer: JSON, CSV of orders and a share link. */
export function DataIO({ input, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const empty = input.trucks.length + input.locations.length + input.orders.length === 0
  const stamp = () => new Date().toISOString().slice(0, 10)

  const readFile = async (file: File | undefined, kind: 'json' | 'csv') => {
    if (!file) return
    try {
      const text = await file.text()
      const next = kind === 'json' ? importJson(text) : importOrdersCsv(input, text)
      onLoad(next)
      setMsg({
        kind: 'ok',
        lines: [
          kind === 'json'
            ? `Učitano: ${next.trucks.length} vozila, ${next.locations.length} lokacija, ${next.orders.length} naloga.`
            : `Učitano ${next.orders.length} naloga iz CSV-a (vozila i lokacije su ostali isti).`,
        ],
      })
    } catch (e) {
      setMsg({ kind: 'error', lines: e instanceof ImportError ? e.problems : [String(e)] })
    }
  }

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
          <div className="data-io-row">
            <span className="data-io-label">Cijeli skup (JSON)</span>
            <button className="btn-outline small" disabled={empty} onClick={() => download(`uprent-podaci-${stamp()}.json`, exportJson(input), 'application/json')}>
              Preuzmi
            </button>
            <button className="btn-outline small" onClick={() => jsonRef.current?.click()}>
              Učitaj…
            </button>
          </div>
          <div className="data-io-row">
            <span className="data-io-label">Nalozi (CSV, Excel)</span>
            <button
              className="btn-outline small"
              disabled={input.orders.length === 0}
              onClick={() => download(`uprent-nalozi-${stamp()}.csv`, exportOrdersCsv(input), 'text/csv;charset=utf-8')}
            >
              Preuzmi
            </button>
            <button className="btn-outline small" disabled={input.locations.length < 2} onClick={() => csvRef.current?.click()}>
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
            ref={jsonRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void readFile(e.target.files?.[0], 'json')
              e.target.value = ''
            }}
          />
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              void readFile(e.target.files?.[0], 'csv')
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
          <p className="hint">
            CSV stupci: nalog; stroj; tezina_kg; preuzimanje; isporuka; utovar_min; istovar_min. Lokacije iz CSV-a moraju
            već postojati.
          </p>
        </div>
      )}
    </div>
  )
}
