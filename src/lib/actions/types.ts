export interface ActionResult<T = undefined> {
  ok: boolean
  error?: string
  data?: T
}

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(error: unknown, fallback = 'Something went wrong.'): ActionResult<never> {
  const message = error instanceof Error ? error.message : fallback
  return { ok: false, error: message }
}
