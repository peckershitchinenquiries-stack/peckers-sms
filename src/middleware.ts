import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/** Routes reachable without a session. */
const PUBLIC_PATHS = ['/login', '/auth', '/gallery']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname, search } = request.nextUrl

  // The cron endpoint authenticates with its own bearer secret.
  if (pathname.startsWith('/api/cron')) {
    return response
  }

  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', `${pathname}${search}`)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Already signed in — don't show the login screen again.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
