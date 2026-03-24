import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // 1. Host-based Routing
  let hostname = request.headers.get('host') || '';
  hostname = hostname.split(':')[0]; // Remove port if exists

  const appDomains = [
    'localhost', '127.0.0.1', '64.23.182.183', 
    'app.cronuzb2b.com.br', 'app.cronuzb2b.localhost',
    'app.fmz.com.br', 'app.fmz.localhost',
    'app.horusb2b.com.br', 'app.horusb2b.localhost'
  ];
  const marketingDomains = [
    'cronuzb2b.com.br', 'www.cronuzb2b.com.br',
    'cronuz.com.br', 'www.cronuz.com.br',
    'fmz.com.br', 'www.fmz.com.br',
    'fmz.localhost',
    'horusb2b.com.br', 'www.horusb2b.com.br', 'horusb2b.localhost'
  ];

  // A. Tenant detection
  let tenant = 'cronuz';
  if (hostname.includes('fmz') || hostname.includes('horus')) {
      tenant = 'horus';
  }
  
  // Prepare headers to inject the tenant
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', tenant);

  // B. Marketing Site (Public)
  if (marketingDomains.includes(hostname)) {
    // se formos adicionar outras rotas como /marketing/contato, podemos fazer rewrite também
    if (url.pathname === '/') {
        url.pathname = '/marketing';
        return NextResponse.rewrite(url, {
          request: { headers: requestHeaders }
        });
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // C. Custom Domain / Tenant Hotsite (Public)
  if (!appDomains.includes(hostname) && !marketingDomains.includes(hostname)) {
    const isAppNativePath = url.pathname.startsWith('/store') || url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/cart') || url.pathname.startsWith('/checkout');
    
    if (!isAppNativePath) {
      url.pathname = `/domain/${hostname}${url.pathname === '/' ? '' : url.pathname}`;
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders }
      });
    }
  }

  // D. B2B System Application (Auth Protected)
  const token = request.cookies.get('cronuz_b2b_token');
  const userCookie = request.cookies.get('cronuz_b2b_user');
  const isLoginPage = url.pathname === '/login';
  const isUploads = url.pathname.startsWith('/uploads');
  const isPublicPage = url.pathname.startsWith('/h/') || url.pathname.startsWith('/marketing');

  // Skip auth checks for public routes hitting the app domain directly
  if (isUploads || isPublicPage) {
     return NextResponse.next({ request: { headers: requestHeaders } });
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
          const targetHost = marketingDomains.includes(hostname) ? 'https://app.cronuzb2b.com.br' : request.url;
          return NextResponse.redirect(new URL(isCustomer ? '/store' : '/', targetHost));
        }
        
        if (isCustomer && !url.pathname.startsWith('/store') && !url.pathname.startsWith('/login')) {
          const targetHost = marketingDomains.includes(hostname) ? 'https://app.cronuzb2b.com.br' : request.url;
          return NextResponse.redirect(new URL('/store', targetHost));
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

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|images|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
