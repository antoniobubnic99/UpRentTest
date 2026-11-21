import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { DataIO } from './components/DataIO'
import { ConfirmBar, LocationsPanel, OrdersPanel, TrucksPanel, type Flags } from './components/InputTables'
import { ModeSwitch } from './components/ModeSwitch'
import { Results } from './components/Results'
import { SettingsPanel } from './components/SettingsPanel'
import { cloneDefaultInput, emptyInput, isEmptyInput } from './data/defaultData'
import { clearAll } from './data/edit'
import { fetchRoadMatrix } from './data/routing'
import { ImportError, decodeShare, shareTokenFromHash } from './data/io'
import { LANGS, getLang, initialLang, saveLang, setLang, tr, type Lang } from './i18n'
import { InputError, solve, validatePlan, type Plan, type ProblemInput } from './solver'

// Leaflet is loaded only in the real-map mode.
const GeoEditor = lazy(() => import('./components/GeoEditor'))

export type Result =
  | {
      kind: 'ok'
      plan: Plan
      violations: string[]
      /** what was solved (incl. road distances) */
      input: ProblemInput
      /** the editor state it was solved from (for the "data changed" hint) */
      source: ProblemInput
      /** e.g. road distances unavailable -> air distance used */
      notice?: string
    }
  | { kind: 'error'; problems: string[] }
  | { kind: 'none' }

function run(input: ProblemInput, source: ProblemInput = input, notice?: string): Result {
  try {
    const plan = solve(input)
    return { kind: 'ok', plan, violations: validatePlan(input, plan), input, source, notice }
  } catch (e) {
    if (e instanceof InputError) return { kind: 'error', problems: e.problems }
    return { kind: 'error', problems: [String(e)] }
  }
}

/**
 * In real-map mode with road distances, fetch the driving-distance matrix (OSRM) first;
 * if the service is unavailable, solve with air distance x factor and say so.
 */
async function solveWithRoads(input: ProblemInput): Promise<Result> {
  const wantsRoads = input.coordinateMode === 'geo' && input.settings.distanceSource === 'road'
  const located = input.locations.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon))
  if (!wantsRoads || located.length < 2 || located.length !== input.locations.length) return run(input)
  try {
    const roadMatrix = await fetchRoadMatrix(input.locations)
    return run({ ...input, roadMatrix }, input)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    return run(input, input, tr('app.noRoads', { why, f: input.settings.roadFactor }))
  }
}

type Tab = 'trucks' | 'locations' | 'orders' | 'settings'
/** Input panel: hidden, side by side with the results, or over the whole screen. */
type DrawerState = 'closed' | 'open' | 'full'

const MOBILE = '(max-width: 900px)'

/** Orders to highlight in the input: unassigned ones (with the reason) and those named in input errors. */
function flagsOf(result: Result, input: ProblemInput): Flags {
  const flags: Flags = new Map()
  if (result.kind === 'ok') for (const u of result.plan.unassigned) flags.set(u.orderId, u.reason)
  if (result.kind === 'error') {
    for (const o of input.orders) {
      const named = (p: string, id: string) => p.split(/[^\p{L}\p{N}_-]+/u).includes(id)
      const hits = result.problems.filter((p) => named(p, o.id) || named(p, o.machineId))
      if (hits.length) flags.set(o.id, hits.join(' '))
    }
  }
  return flags
}

export default function App() {
  // Requirement 3: start empty; "Vrati podatke iz zadatka" fills in the task data.
  const [input, setInput] = useState<ProblemInput>(() => emptyInput())
  const [result, setResult] = useState<Result>({ kind: 'none' })
  const [tab, setTab] = useState<Tab>('trucks')
  const [drawer, setDrawer] = useState<DrawerState>(() => (window.matchMedia(MOBILE).matches ? 'closed' : 'open'))
  const drawerOpen = drawer !== 'closed'
  const setDrawerOpen = (v: boolean | ((prev: boolean) => boolean)) =>
    setDrawer((d) => ((typeof v === 'function' ? v(d !== 'closed') : v) ? (d === 'closed' ? 'open' : d) : 'closed'))
  // phones: the language picker shows only the code (HR / EN / FR / DE)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const [lang, setLangState] = useState<Lang>(() => {
    const l = initialLang()
    setLang(l)
    return l
  })
  const [confirmClear, setConfirmClear] = useState(false)
  const empty = isEmptyInput(input)
  const stale = result.kind === 'ok' && result.source !== input
  const [busy, setBusy] = useState(false)

  // Data shared by link (#d=...): load it once on start.
  const [shareNote, setShareNote] = useState<string | null>(null)
  useEffect(() => {
    const token = shareTokenFromHash(window.location.hash)
    if (!token) return
    decodeShare(token)
      .then((shared) => {
        setInput(shared)
        void solveWithRoads(shared).then(setResult)
        setShareNote(
          tr('app.sharedLoaded', { trucks: shared.trucks.length, locations: shared.locations.length, orders: shared.orders.length }),
        )
      })
      .catch((e: unknown) => setShareNote(e instanceof ImportError ? e.problems.join(' ') : tr('app.sharedFailed')))
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(MOBILE)
    const onChange = () => setDrawer(mq.matches ? 'closed' : 'open')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Language: messages from the solver are produced in the current language, so the last
  // result is computed again (road distances are cached).
  const changeLang = (l: Lang) => {
    setLang(l)
    saveLang(l)
    document.documentElement.lang = l
    setLangState(l)
    if (result.kind === 'ok') void solveWithRoads(result.source).then(setResult)
    else if (result.kind === 'error') setResult(run(input))
  }
  useEffect(() => {
    document.documentElement.lang = getLang()
  }, [])
  useEffect(() => {
    if (drawer === 'full') window.scrollTo({ top: 0 })
  }, [drawer])
  const flags = useMemo(() => flagsOf(result, input), [result, input])
  const flaggedCount = input.orders.filter((o) => flags.has(o.id)).length

  const closeOnMobile = () => {
    if (window.matchMedia(MOBILE).matches) setDrawer('closed')
    // full-screen input: show the results after optimising
    else setDrawer((d) => (d === 'full' ? 'open' : d))
  }
  const optimise = () => {
    setBusy(true)
    void solveWithRoads(input)
      .then(setResult)
      .finally(() => setBusy(false))
    closeOnMobile()
  }
  const loadTask = () => {
    const fresh = cloneDefaultInput()
    setInput(fresh)
    setResult(run(fresh))
    setConfirmClear(false)
    closeOnMobile()
  }
  const clear = () => {
    setInput(clearAll(input))
    setResult({ kind: 'none' })
    setConfirmClear(false)
  }

  const tabs: { id: Tab; label: string; count?: number; warn?: number }[] = [
    { id: 'trucks', label: tr('app.tabVehicles'), count: input.trucks.length },
    { id: 'locations', label: tr('app.tabLocations'), count: input.locations.length },
    { id: 'orders', label: tr('app.tabOrders'), count: input.orders.length, warn: flaggedCount },
    { id: 'settings', label: tr('app.tabSettings') },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="hamburger"
            aria-label={drawerOpen ? tr('app.hideInput') : tr('app.showInput')}
            aria-expanded={drawerOpen}
            aria-controls="drawer"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="brand">
            <img className="brand-logo" src="/uprent-logo.png" alt="Up Rent" />
            <span className="brand-sub">Smart Logistics Planner</span>
          </div>
          <span className="topbar-meta">{tr('app.slogan')}</span>
          <label className="lang-select">
            <span className="sr-only">{tr('app.language')}</span>
            <select value={lang} onChange={(e) => changeLang(e.target.value as Lang)} aria-label={tr('app.language')}>
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {narrow ? l.flag : `${l.flag} · ${l.label}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className={`layout ${drawerOpen ? 'drawer-open' : ''} ${drawer === 'full' ? 'drawer-full' : ''}`}>
        {drawerOpen && <div className="backdrop" onClick={() => setDrawer('closed')} aria-hidden />}
        {!drawerOpen && (
          <button className="drawer-tab" onClick={() => setDrawer('open')} title={tr('app.showInput')} aria-label={tr('app.showInput')}>
            <span aria-hidden>›</span>
            <span className="drawer-tab-label">{tr('app.inputTitle')}</span>
          </button>
        )}
        <aside id="drawer" className="drawer" aria-label={tr('app.drawerAria')} hidden={!drawerOpen}>
          <div className="drawer-handle">
            <button
              onClick={() => setDrawer(drawer === 'full' ? 'open' : 'closed')}
              title={drawer === 'full' ? tr('app.splitView') : tr('app.hideInputWide')}
              aria-label={drawer === 'full' ? tr('app.splitView') : tr('app.hideInputWide')}
            >
              ‹
            </button>
            {drawer === 'open' && (
              <button onClick={() => setDrawer('full')} title={tr('app.fullScreenWide')} aria-label={tr('app.fullScreenWide')}>
                ›
              </button>
            )}
          </div>
          <div className="drawer-top">
            <h2>{tr('app.inputTitle')}</h2>
            <div className="drawer-actions">
              <button className="btn-secondary" onClick={loadTask}>
                {tr('app.loadTask')}
              </button>
              <button className="btn-outline" disabled={empty} onClick={() => setConfirmClear(true)}>
                {tr('app.clearAll')}
              </button>
              <span className="drawer-view">
                <button
                  className="btn-outline small"
                  title={drawer === 'full' ? tr('app.splitView') : tr('app.fullScreen')}
                  onClick={() => setDrawer(drawer === 'full' ? 'open' : 'full')}
                >
                  {drawer === 'full' ? `‹ ${tr('app.splitShort')}` : `⤢ ${tr('app.fullShort')}`}
                </button>
              </span>
            </div>
            <DataIO
              input={input}
              onLoad={(next) => {
                setInput(next)
                setResult({ kind: 'none' })
              }}
            />
            {confirmClear && (
              <ConfirmBar
                pending={{
                  message: tr('app.clearConfirm', { trucks: input.trucks.length, locations: input.locations.length, orders: input.orders.length }),
                  confirmLabel: tr('app.clearAll'),
                  onConfirm: clear,
                }}
                onClose={() => setConfirmClear(false)}
              />
            )}
            <div className="tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  <span className="tab-label" title={t.label}>
                    {t.label}
                  </span>
                  {t.count !== undefined && !t.warn && <span className="count">{t.count}</span>}
                  {!!t.warn && (
                    <span className="count warn" title={tr('app.flaggedTab', { n: t.warn })}>
                      ⚠{t.warn}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="drawer-body" role="tabpanel">
            {tab === 'trucks' && <TrucksPanel input={input} onChange={setInput} />}
            {tab === 'locations' && (
              <LocationsPanel
                input={input}
                onChange={setInput}
                geoExtras={
                  <>
                    <ModeSwitch input={input} onChange={setInput} />
                    {input.coordinateMode === 'geo' && (
                      <Suspense fallback={<p className="hint">{tr('app.loadingMap')}</p>}>
                        <GeoEditor input={input} onChange={setInput} />
                      </Suspense>
                    )}
                  </>
                }
              />
            )}
            {tab === 'orders' && <OrdersPanel input={input} onChange={setInput} flags={flags} />}
            {tab === 'settings' && (
              <SettingsPanel
                settings={input.settings}
                orderCount={input.orders.length}
                coordinateMode={input.coordinateMode}
                onChange={(settings) => setInput({ ...input, settings })}
              />
            )}
          </div>

          <div className="drawer-bottom">
            {stale && <span className="stale">{tr('app.staleInput')}</span>}
            <button className="btn-primary" onClick={optimise} disabled={empty || busy}>
              {busy ? tr('app.computing') : tr('app.optimise')}
            </button>
          </div>
        </aside>

        <main className="results" hidden={drawer === 'full'}>
          {shareNote && (
            <div className="alert alert-info share-note">
              {shareNote}{' '}
              <button className="btn-link" onClick={() => setShareNote(null)}>
                {tr('common.close')}
              </button>
            </div>
          )}
          {empty && result.kind === 'none' && (
            <div className="card empty-state">
              <h3>{tr('app.emptyTitle')}</h3>
              <p className="muted">{tr('app.emptyText')}</p>
              <button className="btn-primary" onClick={loadTask}>
                {tr('app.loadTask')}
              </button>
            </div>
          )}

          {!empty && result.kind === 'none' && (
            <div className="card empty-state">
              <h3>{tr('app.readyTitle')}</h3>
              <p className="muted">{tr('app.readyText')}</p>
              <button className="btn-primary" onClick={optimise}>
                {tr('app.optimise')}
              </button>
            </div>
          )}

          {result.kind === 'error' && (
            <div className="alert alert-error">
              <strong>{tr('app.inputInvalid')}</strong>
              <ul>
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {result.kind === 'ok' && (
            <Results
              key={lang}
              result={result}
              onShowOrder={(id) => {
                setTab('orders')
                setDrawer((d) => (d === 'closed' ? 'open' : d))
                requestAnimationFrame(() =>
                  document.getElementById(`order-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
                )
              }}
              stale={stale}
              onApplySettings={(settings) => {
                const next = { ...result.source, settings }
                setInput(next)
                void solveWithRoads(next).then(setResult)
              }}
            />
          )}
        </main>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <span>{tr('app.footer')}</span>
          <span className="disclaimer">{tr('app.disclaimer')}</span>
        </div>
      </footer>
    </div>
  )
}
