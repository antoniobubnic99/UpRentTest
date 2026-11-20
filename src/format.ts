const km1 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const int = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 })

export const fmtKm = (km: number) => `${km1.format(km)} km`
export const fmtKg = (kg: number) => `${int.format(kg)} kg`

/** 8.71 -> "8 h 43 min" */
export function fmtHours(h: number): string {
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh} h ${String(mm).padStart(2, '0')} min`
}
