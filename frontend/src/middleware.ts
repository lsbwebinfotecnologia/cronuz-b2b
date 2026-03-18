import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // 1. Host-based Routing
  let hostname = request.headers.get('host') || '';
  hostname = hostname.split(':')[0]; // Remove port if exists

  const appDomains = ['localhost', '127.0.0.1', '64.23.182.183', 'app.cronuzb2b.com.br', 'www.app.cronuzb2b.com.br'];
  const marketingDomains = ['cronuzb2b.com.br', 'www.cronuzb2b.com.br'];

  // A. Marketing Site (Public)
  if (marketingDomains.includes(hostname)) {
    // If accessing root, rewrite to marketing
    if (url.pathname === '/') {
        url.pathname = '/marketing';
        return NextResponse.rewrite(url);
    }
    // Let other marketing pages pass through natively if we build them
    return NextResponse.next();
  }

  // B. Custom Domain / Tenant Hotsite (Public)
  if (!appDomains.includes(hostname) && !marketingDomains.includes(hostname)) {
    // Rewrite all requests on this domain to /domain/[hostname]/[path]
    // The Next.js catch-all page at /domain/[domain]/page.tsx will handle the presentation
    url.pathname = `/domain/${hostname}${url.pathname === '/' ? '' : url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // C. B2B System Application (Auth Protected)
  const token = request.cookies.get('cronuz_b2b_token');
  const userCookie = request.cookies.get('cronuz_b2b_user');
  const isLoginPage = url.pathname === '/login';
  const isUploads = url.pathname.startsWith('/uploads');
  const isPublicPage = url.pathname.startsWith('/h/') || url.pathname.startsWith('/marketing');

  // Skip auth checks for public routes hitting the app domain directly
  if (isUploads || isPublicPage) {
     return NextResponse.next();
  }

  // If there's no token and we're not on the login page, redirect to login
  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If there's a token
  if (token) {
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie.value);
        const isCustomer = user.type === 'CUSTOMER';
        
        if (isLoginPage) {
          return NextResponse.redirect(new URL(isCustomer ? '/store' : '/', request.url));
        }
        
        if (isCustomer && !url.pathname.startsWith('/store') && !url.pathname.startsWith('/login')) {
          return NextResponse.redirect(new URL('/store', request.url));
        }

        if (url.pathname.startsWith('/companies/new') && user.type !== 'MASTER') {
           return NextResponse.redirect(new URL('/', request.url));
        }
      } catch (e) {
        // ignore parse error
      }
    } else if (isLoginPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|images|favicon.ico).*)'],
};
