import type { ProblemInput } from './types'

export const MAX_ORDERS = 12

export class InputError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(problems.join('\n'))
    this.name = 'InputError'
    this.problems = problems
  }
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dup.add(id)
    seen.add(id)
  }
  return [...dup]
}

/** Returns a list of problems with the input; an empty list means the input is usable. */
export function checkInput(input: ProblemInput): string[] {
  const problems: string[] = []
  const locIds = new Set(input.locations.map((l) => l.id))
  const machineIds = new Set(input.machines.map((m) => m.id))

  for (const [label, ids] of [
    ['lokacija', input.locations.map((l) => l.id)],
    ['strojeva', input.machines.map((m) => m.id)],
    ['naloga', input.orders.map((o) => o.id)],
    ['kamiona', input.trucks.map((t) => t.id)],
  ] as const) {
    const dup = duplicates([...ids])
    if (dup.length) problems.push(`Duplicirane oznake ${label}: ${dup.join(', ')}`)
  }

  if (!locIds.has(input.baseId)) problems.push(`Baza ${input.baseId} ne postoji među lokacijama.`)
  if (input.trucks.length === 0) problems.push('Nema nijednog kamiona.')

  for (const t of input.trucks) {
    if (!(t.capacityKg > 0)) problems.push(`${t.name}: nosivost mora biti veća od 0.`)
    if (!Number.isInteger(t.maxItems) || t.maxItems < 1)
      problems.push(`${t.name}: maksimalan broj strojeva mora biti cijeli broj ≥ 1.`)
  }
  for (const m of input.machines) {
    if (!(m.weightKg > 0)) problems.push(`Stroj ${m.id}: težina mora biti veća od 0.`)
  }
  for (const l of input.locations) {
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y))
      problems.push(`Lokacija ${l.id}: koordinate moraju biti brojevi.`)
  }

  const usedMachines = new Set<string>()
  for (const o of input.orders) {
    if (!machineIds.has(o.machineId)) problems.push(`Nalog ${o.id}: stroj ${o.machineId} ne postoji.`)
    if (!locIds.has(o.pickupId)) problems.push(`Nalog ${o.id}: lokacija preuzimanja ${o.pickupId} ne postoji.`)
    if (!locIds.has(o.deliveryId)) problems.push(`Nalog ${o.id}: lokacija isporuke ${o.deliveryId} ne postoji.`)
    if (usedMachines.has(o.machineId))
      problems.push(`Stroj ${o.machineId} se pojavljuje u više naloga.`)
    usedMachines.add(o.machineId)
  }

  if (input.orders.length > MAX_ORDERS)
    problems.push(
      `Egzaktni solver podržava najviše ${MAX_ORDERS} naloga (zadano: ${input.orders.length}).`,
    )

  const s = input.settings
  if (!(s.speedKmh > 0)) problems.push('Brzina mora biti veća od 0.')
  if (!(s.handlingMinutes >= 0)) problems.push('Vrijeme utovara/istovara ne smije biti negativno.')
  if (!(s.maxHoursPerDay > 0)) problems.push('Dnevni limit mora biti veći od 0.')

  return problems
}
