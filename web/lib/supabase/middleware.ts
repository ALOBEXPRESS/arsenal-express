import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const protectedApi = path.startsWith('/api/') && path !== '/api/auth/login' && path !== '/api/access-requests' && path !== '/api/tiktok/webhook'
  const protectedPage = ['/dashboard', '/project', '/admin', '/tiktok'].some(prefix => path === prefix || path.startsWith(prefix + '/'))
  if (user && (protectedApi || protectedPage)) {
    const { data, error } = await supabase.rpc('system_access_status')
    if (error || !data?.allowed) {
      const denied = protectedApi
        ? NextResponse.json({ error: 'Acesso restrito a e-mails autorizados. Contate empresaalob@gmail.com.' }, { status: error ? 503 : 403 })
        : NextResponse.redirect(new URL('/access-pending', request.url))
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie))
      denied.headers.set('Cache-Control', 'private, no-store')
      return denied
    }
    response.headers.set('Cache-Control', 'private, no-store')
  }
  return response
}
