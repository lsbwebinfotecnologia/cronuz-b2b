import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('cronuz_b2b_token');
  const userCookie = request.cookies.get('cronuz_b2b_user');
  const isLoginPage = request.nextUrl.pathname === '/login';

  // If there's no token and we're not on the login page, redirect to login
  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If there's a token and we are on the login page, redirect to dashboard
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Basic Role Based Protection (for Future expansion)
  if (token && userCookie) {
    try {
      const user = JSON.parse(userCookie.value);
      // Example: Only master can access `/companies/new`
      if (request.nextUrl.pathname.startsWith('/companies/new') && user.type !== 'MASTER') {
         return NextResponse.redirect(new URL('/', request.url));
      }
    } catch (e) {
      // ignore parse error in middleware
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|images|favicon.ico).*)'],
};
