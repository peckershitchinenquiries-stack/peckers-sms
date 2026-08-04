/**
 * Supabase scheduled Edge Function — daily expiry digest.
 *
 * Runs on a cron schedule and calls the Next.js digest endpoint, which owns
 * the business logic (shared with the in-app alert centre so the two can never
 * disagree). This function is deliberately thin: it exists to be the thing
 * Supabase's scheduler can trigger.
 *
 * Deploy:
 *   supabase functions deploy daily-digest --no-verify-jwt
 *   supabase secrets set APP_URL=https://your-app.vercel.app CRON_SECRET=...
 *
 * Schedule (8am Europe/London — the cron runs in UTC, so 07:00 UTC covers
 * BST; see the README for the winter note):
 *   select cron.schedule(
 *     'peckers-daily-digest',
 *     '0 7 * * *',
 *     $$ select net.http_post(
 *          url := 'https://<project-ref>.functions.supabase.co/daily-digest',
 *          headers := '{"Content-Type":"application/json"}'::jsonb
 *        ) $$
 *   );
 */

Deno.serve(async (request: Request): Promise<Response> => {
  const appUrl = Deno.env.get('APP_URL')
  const cronSecret = Deno.env.get('CRON_SECRET')

  if (!appUrl || !cronSecret) {
    return Response.json(
      { ok: false, error: 'APP_URL and CRON_SECRET must be set as function secrets.' },
      { status: 500 },
    )
  }

  // Allow a manual trigger too, but never without the shared secret.
  if (request.method !== 'POST' && request.method !== 'GET') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 })
  }

  try {
    const response = await fetch(`${appUrl.replace(/\/$/, '')}/api/cron/digest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error('[daily-digest] upstream failed', response.status, payload)
      return Response.json({ ok: false, status: response.status, payload }, { status: 502 })
    }

    console.log('[daily-digest] sent', payload)
    return Response.json({ ok: true, payload })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[daily-digest]', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
})
