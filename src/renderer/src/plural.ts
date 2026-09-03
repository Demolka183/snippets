/**
 * Odmiana liczebnikow po polsku.
 *
 * Polski ma trzy formy zamiast angielskich dwoch, wiec `n === 1 ? a : b`
 * daje "2 snippetow" zamiast "2 snippety". Wyjatek 12-14 jest istotny:
 * 22 bierze forme "snippety", ale 12 juz "snippetow".
 */

/**
 * @param one   forma dla 1 - "snippet"
 * @param few   forma dla 2-4 - "snippety"
 * @param many  forma dla 0, 5+ i 12-14 - "snippetow"
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count)
  if (abs === 1) return one
  const lastTwo = abs % 100
  if (lastTwo >= 12 && lastTwo <= 14) return many
  const last = abs % 10
  return last >= 2 && last <= 4 ? few : many
}

/** To samo, ale od razu z liczba z przodu. */
export function withCount(count: number, one: string, few: string, many: string): string {
  return `${count} ${plural(count, one, few, many)}`
}
