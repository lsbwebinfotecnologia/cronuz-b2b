'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, PackageOpen, ChevronRight, ShoppingCart } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { ProductCard } from '@/components/store/ProductCard';
import { useCart } from '@/components/store/CartContext';
import { useStoreConfig } from '@/components/store/StoreContext';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { getImageUrl } from '@/lib/image_helper';

// Placeholder Component for the Product Grid
function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 animate-pulse dark:bg-slate-900/50 dark:border-slate-800">
          <div className="bg-slate-200 dark:bg-slate-800 rounded-xl h-48 w-full mb-4"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mb-2"></div>
        </div>
      ))}
    </div>
  );
}

export default function StoreHome() {
  const { addToCart } = useCart();
  const { companyId } = useStoreConfig();
  const [config, setConfig] = useState<any>(null);
  
  // States to hold actual Product Objects hydrated via Search
  const [heroProducts, setHeroProducts] = useState<any[]>([]);
  const [clearanceProducts, setClearanceProducts] = useState<any[]>([]);
  const [restockProducts, setRestockProducts] = useState<any[]>([]);
  const [featuredProduct, setFeaturedProduct] = useState<any>(null);
  
  const [fallbackProducts, setFallbackProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrateIsbns = async (isbns: string[], token: string | null | undefined) => {
     if (!isbns || isbns.length === 0) return [];
     
     // Fire parallel fetches for each exact ISBN using the product detail endpoint
     const promises = isbns.map(async (isbn) => {
        try {
           const headers: any = {};
           if (token) headers['Authorization'] = `Bearer ${token}`;
           
           const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/product/${encodeURIComponent(isbn)}`, {
             headers,
             cache: 'no-store'
           });
           if (res.ok) {
              const data = await res.json();
              if (data && data.id) return data;
           }
        } catch (e) {
           console.error("Failed hydrating ISBN", isbn, e);
        }
        return null;
     });
     
     const results = await Promise.all(promises);
     // Return only valid resolved items
     return results.filter(p => p !== null);
  };

  useEffect(() => {
    const loadHome = async () => {
      try {
        const token = getToken();
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        // 1. Fetch Dynamic Layout Constraints from API for Correct Company
        const resSettings = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/config?company_id=${companyId}`, {
          headers,
          cache: 'no-store'
        });
        
        if (resSettings.ok) {
           const setup = await resSettings.json();
           const layout = setup.b2b_showcases_config;
           
            if (layout) {
               setConfig(layout);
               // 2. Hydrate all sections in parallel
               const [hero, clear, rest, feat] = await Promise.all([
                   hydrateIsbns(layout.hero_collection?.isbns || [], token),
                   hydrateIsbns(layout.clearance?.isbns || [], token),
                   hydrateIsbns(layout.restock?.isbns || [], token),
                   layout.featured?.isbn ? hydrateIsbns([layout.featured.isbn], token) : Promise.resolve([])
               ]);
               
               setHeroProducts(hero);
               setClearanceProducts(clear);
               setRestockProducts(rest);
               if (feat.length > 0) setFeaturedProduct(feat[0]);
            } else {
               // Set empty state config explicitly so we don't crash
               setConfig({});
            }
        }
      } catch (err) {
        console.error("Booting home failed", err);
      } finally {
        setLoading(false);
      }
    };
    loadHome();
  }, []);

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* Rotating Banners (Top Slider) */}
      {config?.rotating_banners && config.rotating_banners.length > 0 && (
         <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 w-full relative">
            <div className="rounded-3xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800 bg-slate-900">
               <Swiper
                  modules={[Autoplay, Pagination, Navigation]}
                  spaceBetween={0}
                  slidesPerView={1}
                  autoplay={{ delay: 5000, disableOnInteraction: false }}
                  pagination={{ clickable: true }}
                  navigation
                  className="w-full"
               >
                  {config.rotating_banners.map((banner: any, idx: number) => (
                     <SwiperSlide key={idx}>
                        <div className="relative w-full">
                           <img 
                              src={getImageUrl(banner.image_url)} 
                              alt={banner.caption || `Banner ${idx + 1}`} 
                              className="w-full h-auto block object-cover" 
                           />
                           {banner.link && (
                              <a href={banner.link} className="absolute inset-0 z-10">
                                 <span className="sr-only">Ver mais detalhes</span>
                              </a>
                           )}
                           <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
                        </div>
                     </SwiperSlide>
                  ))}
               </Swiper>
            </div>
         </section>
      )}

      {/* Dynamic Featured Posters Area */}
      {config && Object.keys(config).length > 0 && (config.featured?.banner_url || featuredProduct) && (
         <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
           <div className={`grid grid-cols-1 ${(clearanceProducts.length > 0 || restockProducts.length > 0) ? "md:grid-cols-3" : ""} gap-6`}>
             {/* Main Hero Featured Area */}
             <div className={`${(clearanceProducts.length > 0 || restockProducts.length > 0) ? "md:col-span-2" : "md:col-span-1 border-emerald-500 border-b-4"} relative overflow-hidden rounded-3xl bg-slate-900 text-white min-h-[250px] sm:min-h-[300px] flex items-center shadow-lg group`}>
               {/* Banner Image as Background */}
               {config.featured?.banner_url ? (
                  <img src={getImageUrl(config.featured.banner_url)} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-700" alt="Super Destaque" />
               ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-base)] to-slate-900 opacity-60"></div>
               )}
               
               <div className="relative z-10 max-w-lg p-8 md:p-12">
                 {(config.featured?.title || featuredProduct) && (
                     <span className="inline-block px-3 py-1 mb-4 text-xs font-bold uppercase tracking-wider bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white/90 shadow-xl">
                       {config.featured?.title || "Destaque Exclusivo"}
                     </span>
                 )}
                 
                 {featuredProduct ? (
                     <>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 leading-tight drop-shadow-2xl">
                          {featuredProduct.name}
                        </h2>
                        <button 
                         onClick={() => {
                            addToCart(featuredProduct, 1);
                         }}
                         className="bg-[var(--color-primary-base)] text-white px-6 py-3 rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-colors shadow-2xl flex items-center gap-2 active:scale-95"
                        >
                          <ShoppingCart className="w-5 h-5"/> Adicionar ao Carrinho
                        </button>
                     </>
                 ) : config.featured?.banner_url ? (
                     <div className="h-10"></div>
                 ) : (
                     <div className="h-10 bg-white/20 rounded w-2/3 animate-pulse"></div>
                 )}
               </div>
             </div>
             
             {/* Side Banners (Clearance & Restock Hooks) */}
             {(clearanceProducts.length > 0 || restockProducts.length > 0) && (
                 <div className="flex flex-col gap-6">
                   {clearanceProducts.length > 0 && (
                       <div className="flex-1 relative overflow-hidden rounded-3xl bg-emerald-500 text-white p-6 shadow-md flex flex-col justify-end group cursor-default">
                          <h3 className="font-bold text-xl mb-1 relative z-10">{config.clearance?.title || "Ofertas em Foco"}</h3>
                          <p className="text-sm opacity-90 relative z-10">Confira a seleção Abaixo</p>
                          <div className="absolute top-0 right-0 -m-10 w-32 h-32 bg-white/20 blur-xl rounded-full pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                       </div>
                   )}
                   {restockProducts.length > 0 && (
                       <div className="flex-1 relative overflow-hidden rounded-3xl bg-sky-500 text-white p-6 shadow-md flex flex-col justify-end group cursor-default">
                          <h3 className="font-bold text-xl mb-1 relative z-10">{config.restock?.title || "Reposição"}</h3>
                          <p className="text-sm opacity-90 relative z-10">Mantenha seu estoque girando</p>
                          <div className="absolute bottom-0 left-0 -m-10 w-32 h-32 bg-black/10 blur-xl rounded-full pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                       </div>
                   )}
                 </div>
             )}
           </div>
         </section>
      )}

      {/* Dynamic Showcases Rendering */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-16">
        {loading ? (
           <div className="space-y-12">
             <ProductGridSkeleton />
             <ProductGridSkeleton />
           </div>
        ) : config && (heroProducts.length > 0 || clearanceProducts.length > 0 || restockProducts.length > 0) ? (
          <>
             {/* Blocos de Coleção */}
             <ShowcaseRenderRow title={config.hero_collection?.title || "Lançamentos"} products={heroProducts} colorIndicator="bg-[var(--color-primary-base)]" />
             <ShowcaseRenderRow title={config.clearance?.title || "Queima exclusivas"} products={clearanceProducts} colorIndicator="bg-emerald-500" />
             <ShowcaseRenderRow title={config.restock?.title || "Reposição"} products={restockProducts} colorIndicator="bg-sky-500" />
          </>
        ) : (
          <div className="py-24 text-center flex flex-col items-center bg-white rounded-3xl border border-slate-200 border-dashed dark:bg-slate-900/50 dark:border-slate-800 shadow-sm max-w-4xl mx-auto">
             <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <PackageOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />
             </div>
             <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Estamos preparando as novidades!</h3>
             <p className="text-slate-500 max-w-md mx-auto text-lg">
                Nenhuma vitrine foi configurada para exibição no momento. O lojista está ajustando o layout para em breve trazer os melhores lançamentos.
             </p>
          </div>
        )}
      </section>
    </div>
  );
}

// Helper para Renderizar os Blocos Prenchidos com Produtos Fresquinhos!
function ShowcaseRenderRow({ title, products, colorIndicator }: { title: string, products: any[], colorIndicator: string }) {
   if (!products || products.length === 0) return null; // Não desenha seção vazia

   return (
      <div className="space-y-6 animate-fade-in">
         <div className="flex items-center justify-between mb-4">
           <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <span className={`w-2 h-8 rounded-full ${colorIndicator}`}></span>
              {title}
           </h2>
         </div>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
           {products.map((p: any) => (
              <ProductCard key={p.id} product={p} />
           ))}
         </div>
      </div>
   );
}
