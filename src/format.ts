import { locale } from './i18n'

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale(), opts)

export const fmtKm = (km: number) => `${nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km)} km`
export const fmtKg = (kg: number) => `${nf({ maximumFractionDigits: 0 }).format(kg)} kg`
export const fmtNum = (v: number, decimals = 0) =>
  nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)

/** 8.71 -> "8 h 43 min" */
export function fmtHours(h: number): string {
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh} h ${String(mm).padStart(2, '0')} min`
}

/** Minutes, e.g. "42 min". */
export const fmtMin = (h: number) => `${Math.round(h * 60)} min`

/** Clock time for a day starting at `startHour` (default 07:00), e.g. 2.5 -> "09:30". */
export function fmtClock(h: number, startHour = 7): string {
  const m = Math.round((startHour + h) * 60)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
