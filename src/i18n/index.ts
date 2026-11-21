import { hr } from './hr'
import { en } from './en'
import { fr } from './fr'
import { de } from './de'

/**
 * Lightweight translations (no library): one flat catalog per language.
 * Croatian is the source catalog; the type below forces every other language to define
 * every key with the same parameters, so a missing translation is a compile error.
 *
 * The current language is module state, so plain TypeScript (solver messages, CSV errors)
 * can translate too without React. The app re-renders (and re-solves) on a language change.
 */

export type Lang = 'hr' | 'en' | 'fr' | 'de'

type Source = typeof hr
export type Catalog = {
  [K in keyof Source]: Source[K] extends (p: infer P) => string ? (p: P) => string : string
}
export type Key = keyof Catalog
type Params<K extends Key> = Catalog[K] extends (p: infer P) => string ? [p: P] : []

export const LANGS: { id: Lang; label: string; locale: string; flag: string }[] = [
  { id: 'hr', label: 'Hrvatski', locale: 'hr-HR', flag: 'HR' },
  { id: 'en', label: 'English', locale: 'en-GB', flag: 'EN' },
  { id: 'fr', label: 'Français', locale: 'fr-FR', flag: 'FR' },
  { id: 'de', label: 'Deutsch', locale: 'de-DE', flag: 'DE' },
]

const catalogs: Record<Lang, Catalog> = { hr, en, fr, de }

let current: Lang = 'hr'

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang) {
  current = lang
}

/** Number / date locale of the current language. */
export function locale(): string {
  return LANGS.find((l) => l.id === current)!.locale
}

/** Translate a key in the current language. */
export function tr<K extends Key>(key: K, ...params: Params<K>): string {
  const v = (catalogs[current][key] ?? hr[key]) as string | ((p: unknown) => string)
  return typeof v === 'function' ? v(params[0]) : v
}

const STORAGE_KEY = 'uprent-lang'

/** Saved choice, else the browser language if supported, else Croatian. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (saved && saved in catalogs) return saved
  } catch {
    // storage unavailable
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'hr').slice(0, 2) as Lang
  return nav in catalogs ? nav : 'hr'
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // storage unavailable
  }
}

export { hrPlural } from './plural'
