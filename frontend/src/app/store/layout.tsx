import React from 'react';
import { cookies, headers } from 'next/headers';
import { StoreHeader } from '@/components/store/StoreHeader';
import { StoreProvider } from '@/components/store/StoreContext';
import { CartProvider } from '@/components/store/CartContext';
import { CartDrawer } from '@/components/store/CartDrawer';

function decodeJWTPayload(token: string) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch(e) {
    return null;
  }
}

async function getStoreConfig(companyId: number) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/config?company_id=${companyId}`, { 
      next: { revalidate: 60 } 
    });
    if (res.ok) {
      const data = await res.json();
      return { 
        coverImageBaseUrl: data.cover_image_base_url || null,
        usesHorus: data.uses_horus || false,
        logo: data.logo || null,
        name: data.name || null
      };
    }
  } catch (error) {
    console.error("Failed to fetch store settings:", error);
  }
  return { coverImageBaseUrl: null, usesHorus: false, logo: null, name: null };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // Infer tenant dynamic logic or default to 1
  let companyId = 1;
  const cookieStore = await cookies();
  const headersList = await headers();
  const hostname = headersList.get('host') || '';
  const hostKey = hostname.split(':')[0];
  const tokenRecord = cookieStore.get(`cronuz_b2b_token_${hostKey}`) || cookieStore.get('cronuz_b2b_token');
  const token = tokenRecord?.value;
  if (token) {
    const decoded = decodeJWTPayload(token);
    if (decoded && decoded.company_id) {
      companyId = decoded.company_id;
    }
  }

  const config = await getStoreConfig(companyId);

  return (
    <StoreProvider coverImageBaseUrl={config.coverImageBaseUrl} companyId={companyId} usesHorus={config.usesHorus} logo={config.logo} name={config.name}>
      <CartProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0a0f1c] dark:text-white flex flex-col font-sans transition-colors duration-200">
          <StoreHeader />
          <CartDrawer />
          <main className="flex-1 w-full flex flex-col">
            {children}
          </main>
          
          {/* Simple Footer */}
          <footer className="mt-auto border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>&copy; {new Date().getFullYear()} Cronuz. Todos os direitos reservados.</p>
            </div>
          </footer>
        </div>
      </CartProvider>
    </StoreProvider>
  );
}
