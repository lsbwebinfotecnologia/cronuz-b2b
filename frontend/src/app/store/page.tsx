'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, PackageOpen, ChevronRight } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { ProductCard } from '@/components/store/ProductCard';

// Placeholder Component for the Product Grid until we build ProductCard
function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 animate-pulse dark:bg-slate-900/50 dark:border-slate-800">
          <div className="bg-slate-200 dark:bg-slate-800 rounded-xl h-48 w-full mb-4"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-4"></div>
          <div className="flex justify-between items-center mt-4">
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StoreHome() {
  const [showcases, setShowcases] = useState<any[]>([]);
  const [fallbackProducts, setFallbackProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomeContent = async () => {
      try {
        const token = getToken();
        // First, fetch the custom showcases
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/home`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setShowcases(data);
          
          // Se não houver vitrines configuradas, busca o catálogo padrão
          if (data.length === 0) {
             const fbRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/?limit=25`, {
               headers: { 'Authorization': `Bearer ${token}` }
             });
             if (fbRes.ok) {
               const fbData = await fbRes.json();
               setFallbackProducts(fbData.items || []);
             }
          }
        }
      } catch (err) {
        console.error("Failed to load storefront metrics", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomeContent();
  }, []);

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c]">
      
      {/* Vitrine / Banners Section (Hardcoded aesthetic hero for now) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-primary-base)] to-slate-900 text-white min-h-[250px] sm:min-h-[300px] flex items-center p-8 md:p-12 shadow-lg shadow-[var(--color-primary-base)]/20">
            <div className="relative z-10 max-w-lg">
              <span className="inline-block px-3 py-1 mb-4 text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md rounded-full">
                Lançamentos
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 leading-tight">
                Nova Coleção Exclusiva B2B
              </h2>
              <p className="text-slate-200 text-sm sm:text-base mb-6 opacity-90 max-w-sm">
                Abasteça seu estoque com os títulos mais esperados do ano com condições imperdíveis.
              </p>
              <button className="bg-white text-[var(--color-primary-base)] px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-lg shadow-white/10 flex items-center gap-2">
                Ver Lançamentos <ChevronRight className="w-5 h-5"/>
              </button>
            </div>
            <div className="absolute top-0 right-0 -m-20 w-80 h-80 bg-white/10 blur-3xl rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 right-10 -m-10 w-40 h-40 bg-[var(--color-primary-hover)] blur-2xl rounded-full pointer-events-none opacity-50"></div>
          </div>
          
          <div className="flex flex-col gap-6">
            <div className="flex-1 relative overflow-hidden rounded-3xl bg-emerald-500 text-white p-6 shadow-md flex flex-col justify-end">
               <h3 className="font-bold text-xl mb-1 relative z-10">Queima de Estoque</h3>
               <p className="text-sm opacity-90 relative z-10">Até 40% OFF em selecionados</p>
               <div className="absolute top-0 right-0 -m-10 w-32 h-32 bg-white/20 blur-xl rounded-full pointer-events-none"></div>
            </div>
            <div className="flex-1 relative overflow-hidden rounded-3xl bg-sky-500 text-white p-6 shadow-md flex flex-col justify-end">
               <h3 className="font-bold text-xl mb-1 relative z-10">Reposição Rápida</h3>
               <p className="text-sm opacity-90 relative z-10">Os mais vendidos da semana</p>
               <div className="absolute bottom-0 left-0 -m-10 w-32 h-32 bg-black/10 blur-xl rounded-full pointer-events-none"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic Showcases Rendering */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-16">
        {loading ? (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4 animate-pulse"></div>
            </div>
            <ProductGridSkeleton />
          </div>
        ) : showcases.length > 0 ? (
          showcases.map((showcase, index) => (
             <div key={showcase.id || index} className="space-y-6">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <span className="w-2 h-8 bg-[var(--color-primary-base)] rounded-full"></span>
                    {showcase.name}
                 </h2>
               </div>
               
               {/* Showcase Banner se houver */}
               {showcase.banner_url && (
                  <div className="w-full h-48 md:h-64 rounded-3xl overflow-hidden mb-6 relative">
                     <img src={showcase.banner_url} alt={showcase.name} className="w-full h-full object-cover" />
                     <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>
                  </div>
               )}

               {showcase.products && showcase.products.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                   {showcase.products.map((p: any) => (
                      <ProductCard 
                        key={p.id} 
                        product={p} 
                      />
                   ))}
                 </div>
               ) : (
                 <p className="text-slate-500 text-sm">Nenhum produto atende à regra desta vitrine.</p>
               )}
             </div>
          ))
        ) : (
          // Fallback Clássico se não houver NENHUMA vitrine ativa
          <div className="space-y-6">
             <div className="flex items-center justify-between mb-4">
               <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <span className="w-2 h-8 bg-slate-400 rounded-full"></span>
                  Catálogo Geral
               </h2>
             </div>
             
             {fallbackProducts.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center bg-white rounded-3xl border border-slate-200 border-dashed dark:bg-slate-900/50 dark:border-slate-800">
                   <PackageOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
                   <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Catálogo Vazio</h3>
                   <p className="text-slate-500 dark:text-slate-500 max-w-md mt-2">
                     O catálogo B2B ainda não possui produtos.
                   </p>
                </div>
             ) : (
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                 {fallbackProducts.map(p => (
                    <ProductCard 
                      key={p.id} 
                      product={p} 
                    />
                 ))}
               </div>
             )}
          </div>
        )}
      </section>

    </div>
  );
}
