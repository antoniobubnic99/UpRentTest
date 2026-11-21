import { useRef, useState } from 'react'
import { moveLocation } from '../data/edit'
import { geocode } from '../data/geocode'
import { ImportError, checkFileSize, exportJson, importAllCsv, importJson, shareUrl } from '../data/io'
import { fmtNum } from '../format'
import { tr } from '../i18n'
import type { ProblemInput } from '../solver'

interface Props {
  input: ProblemInput
  onLoad: (next: ProblemInput) => void
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function download(name: string, data: string | ArrayBuffer, type: string) {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Msg = { kind: 'ok' | 'error' | 'progress'; lines: string[] }
type FileKind = 'table' | 'json'

const stamp = () => new Date().toISOString().slice(0, 10)

/**
 * Import / export panel in the drawer: one CSV (template, download, upload) with vehicles,
 * locations and orders, the whole data set as JSON, and a share link.
 */
export function DataIO({ input, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingKind, setPendingKind] = useState<FileKind>('table')
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
      setMsg({ kind: 'progress', lines: [tr('io.geocoding', { i: i + 1, n: ids.length, address: loc.address ?? '' })] })
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

  const summary = (next: ProblemInput) =>
    tr('io.loaded', { trucks: next.trucks.length, locations: next.locations.length, orders: next.orders.length })

  const readFile = async (file: File | undefined) => {
    if (!file) return
    const kind = pendingKind
    try {
      checkFileSize(file.size)
      const isXlsx = /\.xlsx$/i.test(file.name)
      const text = isXlsx ? '' : await file.text()
      if (kind === 'json') {
        const next = importJson(text)
        onLoad(next)
        setMsg({ kind: 'ok', lines: [summary(next)] })
        return
      }
      // Excel (.xlsx) or, as before, a CSV with #sections; the Excel module loads on demand
      const { input: next, toGeocode } = isXlsx
        ? await (await import('../data/xlsx')).importXlsx(input, await file.arrayBuffer())
        : importAllCsv(input, text)
      onLoad(next)
      const mode = next.coordinateMode === 'geo' ? tr('mode.geo') : tr('mode.xy')
      const head = `${summary(next)} ${tr('io.modeBase', { mode, base: next.baseId })}`
      if (toGeocode.length === 0) {
        setMsg({ kind: 'ok', lines: [head] })
        return
      }
      const notFound = await geocodeAll(next, toGeocode)
      setMsg({
        kind: notFound.length ? 'error' : 'ok',
        lines: [
          `${head} ${tr('io.addressesFound', { found: toGeocode.length - notFound.length, n: toGeocode.length })}`,
          ...(notFound.length ? [tr('io.notFound', { list: notFound.join('; ') })] : []),
        ],
      })
    } catch (e) {
      setMsg({ kind: 'error', lines: e instanceof ImportError ? e.problems : [String(e)] })
    }
  }

  /** Runs an action with the Excel module, loaded on first use. */
  const excel = async (fn: (x: typeof import('../data/xlsx')) => Promise<void>) => {
    try {
      setMsg({ kind: 'progress', lines: [tr('xlsx.preparing')] })
      await fn(await import('../data/xlsx'))
      setMsg(null)
    } catch (e) {
      setMsg({ kind: 'error', lines: [String(e)] })
    }
  }

  const copyLink = async () => {
    try {
      const url = await shareUrl(input, window.location.href)
      await navigator.clipboard.writeText(url)
      window.history.replaceState(null, '', url)
      setMsg({ kind: 'ok', lines: [tr('io.linkCopied', { n: fmtNum(url.length) })] })
    } catch (e) {
      setMsg({ kind: 'error', lines: [tr('io.linkFailed', { why: e instanceof Error ? e.message : String(e) })] })
    }
  }

  return (
    <div className="data-io">
      <button className="btn-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {tr('io.title')}
      </button>
      {open && (
        <div className="data-io-panel">
          <p className="hint">{tr('xlsx.help')}</p>
          <div className="data-io-row">
            <span className="data-io-label">{tr('xlsx.label')}</span>
            <button
              className="btn-outline small"
              onClick={() => excel(async (x) => download(`${tr('io.fileTemplate')}.xlsx`, await x.templateXlsx(), XLSX))}
            >
              {tr('io.template')}
            </button>
            <button
              className="btn-outline small"
              disabled={empty}
              onClick={() =>
                excel(async (x) => download(`uprent-${tr('io.fileData')}-${stamp()}.xlsx`, await x.exportXlsx(input), XLSX))
              }
            >
              {tr('io.download')}
            </button>
            <button className="btn-outline small" onClick={() => pickFile('table')} aria-label={tr('xlsx.uploadAria')}>
              {tr('io.upload')}
            </button>
          </div>
          <div className="data-io-row">
            <span className="data-io-label">{tr('io.jsonLabel')}</span>
            <button
              className="btn-outline small"
              disabled={empty}
              onClick={() => download(`uprent-${tr('io.fileData')}-${stamp()}.json`, exportJson(input), 'application/json')}
            >
              {tr('io.download')}
            </button>
            <button className="btn-outline small" onClick={() => pickFile('json')} aria-label={tr('io.uploadJsonAria')}>
              {tr('io.upload')}
            </button>
          </div>
          <div className="data-io-row">
            <span className="data-io-label">{tr('io.linkLabel')}</span>
            <button className="btn-outline small" disabled={empty} onClick={copyLink}>
              {tr('io.copyLink')}
            </button>
          </div>
          <p className="hint">🔒 {tr('io.linkWarning')}</p>
          <input
            ref={fileRef}
            type="file"
            data-kind={pendingKind}
            accept={pendingKind === 'json' ? '.json,application/json' : `.xlsx,${XLSX},.csv,text/csv`}
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
              {msg.lines.length > 6 && <div>{tr('io.more', { n: msg.lines.length - 6 })}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
