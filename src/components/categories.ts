import { CATEGORY_LABELS } from '../lib/csv'
import { CATEGORIES, type Category } from '../lib/types'

export const CATEGORY_ICONS: Record<Category, string> = {
  food: '🍽️',
  groceries: '🛒',
  lodging: '🏠',
  transport: '🚗',
  activities: '🎟️',
  shopping: '🛍️',
  utilities: '💡',
  other: '📦',
}

export const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c, icon: CATEGORY_ICONS[c] }))

export function categoryLabel(c: Category | undefined): string {
  return c ? (CATEGORY_LABELS[c] ?? c) : 'Uncategorized'
}

export function categoryIcon(c: Category | undefined): string {
  return c ? CATEGORY_ICONS[c] : '🧾'
}
