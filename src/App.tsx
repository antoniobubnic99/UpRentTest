import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { DataIO } from './components/DataIO'
import { ConfirmBar, LocationsPanel, OrdersPanel, TrucksPanel } from './components/InputTables'
import { ModeSwitch } from './components/ModeSwitch'
import { Results } from './components/Results'
import { SettingsPanel } from './components/SettingsPanel'
import { cloneDefaultInput, emptyInput, isEmptyInput } from './data/defaultData'
import { clearAll } from './data/edit'
import { ImportError, decodeShare, shareTokenFromHash } from './data/io'
import { InputError, solve, validatePlan, type Plan, type ProblemInput } from './solver'

// Leaflet is loaded only in the real-map mode.
const GeoEditor = lazy(() => import('./components/GeoEditor'))

export type Result =
  | { kind: 'ok'; plan: Plan; violations: string[]; input: ProblemInput }
  | { kind: 'error'; problems: string[] }
  | { kind: 'none' }

function run(input: ProblemInput): Result {
  try {
    const plan = solve(input)
    return { kind: 'ok', plan, violations: validatePlan(input, plan), input }
  } catch (e) {
    if (e instanceof InputError) return { kind: 'error', problems: e.problems }
    return { kind: 'error', problems: [String(e)] }
  }
}

type Tab = 'trucks' | 'locations' | 'orders' | 'settings'

const MOBILE = '(max-width: 900px)'

export default function App() {
  // Requirement 3: start empty; "Vrati podatke iz zadatka" fills in the task data.
  const [input, setInput] = useState<ProblemInput>(() => emptyInput())
  const [result, setResult] = useState<Result>({ kind: 'none' })
  const [tab, setTab] = useState<Tab>('trucks')
  const [drawerOpen, setDrawerOpen] = useState(() => !window.matchMedia(MOBILE).matches)
  const [confirmClear, setConfirmClear] = useState(false)
  const empty = isEmptyInput(input)
  const stale = result.kind === 'ok' && result.input !== input

  // Data shared by link (#d=...): load it once on start.
  const [shareNote, setShareNote] = useState<string | null>(null)
  useEffect(() => {
    const token = shareTokenFromHash(window.location.hash)
    if (!token) return
    decodeShare(token)
      .then((shared) => {
        setInput(shared)
        setResult(run(shared))
        setShareNote(
          `Učitani su podaci iz linka: ${shared.trucks.length} vozila, ${shared.locations.length} lokacija, ${shared.orders.length} naloga.`,
        )
      })
      .catch((e: unknown) =>
        setShareNote(e instanceof ImportError ? e.problems.join(' ') : 'Podatke iz linka nije moguće učitati.'),
      )
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(MOBILE)
    const onChange = () => setDrawerOpen(!mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const closeOnMobile = () => {
    if (window.matchMedia(MOBILE).matches) setDrawerOpen(false)
  }
  const optimise = () => {
    setResult(run(input))
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

  const tabs = useMemo(
    () =>
      [
        { id: 'trucks', label: 'Vozila', count: input.trucks.length },
        { id: 'locations', label: 'Lokacije', count: input.locations.length },
        { id: 'orders', label: 'Nalozi', count: input.orders.length },
        { id: 'settings', label: 'Postavke' },
      ] as { id: Tab; label: string; count?: number }[],
    [input],
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="hamburger"
            aria-label={drawerOpen ? 'Sakrij ulazne podatke' : 'Prikaži ulazne podatke'}
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
          <span className="topbar-meta">Najam • Prodaja • Servis • Transport</span>
        </div>
      </header>

      <div className={`layout ${drawerOpen ? 'drawer-open' : ''}`}>
        {drawerOpen && <div className="backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />}
        <aside id="drawer" className="drawer" aria-label="Ulazni podaci i ograničenja" hidden={!drawerOpen}>
          <div className="drawer-top">
            <h2>Ulazni podaci</h2>
            <div className="drawer-actions">
              <button className="btn-secondary" onClick={loadTask}>
                Vrati podatke iz zadatka
              </button>
              <button className="btn-outline" disabled={empty} onClick={() => setConfirmClear(true)}>
                Obriši sve
              </button>
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
                  message: `Obrisati sva vozila (${input.trucks.length}), lokacije (${input.locations.length}) i naloge (${input.orders.length})? Postavke ostaju.`,
                  confirmLabel: 'Obriši sve',
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
                  {t.label}
                  {t.count !== undefined && <span className="count">{t.count}</span>}
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
                      <Suspense fallback={<p className="hint">Učitavam kartu…</p>}>
                        <GeoEditor input={input} onChange={setInput} />
                      </Suspense>
                    )}
                  </>
                }
              />
            )}
            {tab === 'orders' && <OrdersPanel input={input} onChange={setInput} />}
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
            {stale && <span className="stale">Podaci su promijenjeni. Pokreni optimizaciju ponovno.</span>}
            <button className="btn-primary" onClick={optimise} disabled={empty}>
              Optimiziraj raspored
            </button>
          </div>
        </aside>

        <main className="results">
          {shareNote && (
            <div className="alert alert-info share-note">
              {shareNote}{' '}
              <button className="btn-link" onClick={() => setShareNote(null)}>
                Zatvori
              </button>
            </div>
          )}
          {empty && result.kind === 'none' && (
            <div className="card empty-state">
              <h3>Još nema podataka za planiranje</h3>
              <p className="muted">
                Dodaj vozila, lokacije i naloge u lijevom izborniku ili učitaj primjer iz zadatka (2 kamiona, 10
                lokacija, 10 naloga).
              </p>
              <button className="btn-primary" onClick={loadTask}>
                Vrati podatke iz zadatka
              </button>
            </div>
          )}

          {!empty && result.kind === 'none' && (
            <div className="card empty-state">
              <h3>Podaci su spremni</h3>
              <p className="muted">Pokreni optimizaciju gumbom „Optimiziraj raspored”.</p>
              <button className="btn-primary" onClick={optimise}>
                Optimiziraj raspored
              </button>
            </div>
          )}

          {result.kind === 'error' && (
            <div className="alert alert-error">
              <strong>Ulazni podaci nisu ispravni:</strong>
              <ul>
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {result.kind === 'ok' && (
            <Results
              result={result}
              stale={stale}
              onApplySettings={(settings) => {
                const next = { ...result.input, settings }
                setInput(next)
                setResult(run(next))
              }}
            />
          )}
        </main>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <span>
            Egzaktni solver (dinamičko programiranje) do 12 naloga, iznad toga heuristika · udaljenosti zaokružene na
            0,1 km po dionici
          </span>
          <span className="disclaimer">
            Prototip izrađen u sklopu selekcijskog zadatka, nije službeni proizvod Up Rent d.o.o.
          </span>
        </div>
      </footer>
    </div>
  )
}
