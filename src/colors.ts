/**
 * Vehicle colours. The first two follow the Up Rent palette (signal yellow, graphite);
 * the rest are distinct, colour-blind-friendlier hues for additional vehicles.
 */
export const TRUCK_COLORS = [
  '#FFFF00',
  '#4B5563',
  '#F59E0B',
  '#2563EB',
  '#DC2626',
  '#16A34A',
  '#7C3AED',
  '#0D9488',
  '#DB2777',
  '#92400E',
]

export function truckColor(index: number): string {
  return TRUCK_COLORS[index % TRUCK_COLORS.length]
}
