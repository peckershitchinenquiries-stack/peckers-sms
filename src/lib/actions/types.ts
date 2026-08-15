export interface ActionResult<T = undefined> {
  ok: boolean
  error?: string
  data?: T
}

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data }
}

/**
 * Next signals `redirect()` and `notFound()` by throwing an error carrying a
 * `digest` string. Matched structurally rather than via `next/dist/...`, which
 * is a private path that moves between releases.
 */
function isControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')
  )
}

export function fail(error: unknown, fallback = 'Something went wrong.'): ActionResult<never> {
  // The auth guards (`requireSession`, `requirePrepAccess`) redirect by
  // throwing, so swallowing it here would turn "you're not allowed in, go
  // home" into a confusing generic failure toast.
  if (isControlFlowError(error)) throw error

  const message = error instanceof Error ? error.message : fallback
  return { ok: false, error: message }
}
