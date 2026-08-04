import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Refreshes the Supabase session cookie on every request and returns both the
 * response (carrying any rotated cookies) and the current user.
 *
 * Server Components can't write cookies, so this is the only place the refresh
 * token gets rotated.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() (not getSession()) revalidates the JWT with Supabase — required
  // before trusting it for an auth decision.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response, user, supabase }
}
