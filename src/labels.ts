import { tr } from './i18n'
import type { RouteStep } from './solver'

/** Translated name of a route action (Polazak, Preuzimanje, ...). */
export const actionLabel = (a: RouteStep['action']) => tr(`act.${a}`)
