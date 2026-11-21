// Minimal toast queue (one visible at a time), framework-free.

export interface ToastAction {
  label: string
  onClick: () => void
  /** Re-evaluated on every render; e.g. Undo expires after the next edit. */
  isDisabled?: () => boolean
}

export interface ToastItem {
  id: number
  message: string
  action?: ToastAction
  durationMs: number
}

let current: ToastItem | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(t: { message: string; action?: ToastAction; durationMs?: number }): void {
  if (timer) clearTimeout(timer)
  const item: ToastItem = { id: ++seq, message: t.message, durationMs: t.durationMs ?? (t.action ? 8000 : 4000) }
  if (t.action) item.action = t.action
  current = item
  emit()
  timer = setTimeout(dismissToast, item.durationMs)
}

export function dismissToast(): void {
  if (timer) clearTimeout(timer)
  timer = null
  current = null
  emit()
}

export function getToast(): ToastItem | null {
  return current
}

export function subscribeToast(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
