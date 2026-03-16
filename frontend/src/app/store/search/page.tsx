'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PackageOpen, Search as SearchIcon } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { ProductCard } from '@/components/store/ProductCard';

function SearchResults() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get('q') || '';
  const query = decodeURIComponent(rawQuery);

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      try {
        const token = getToken();
        // Fallback to empty token if not logged in (storefront is public)
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`http://localhost:8000/storefront/search?q=${encodeURIComponent(query)}&limit=50`, {
          headers
        });

        if (res.ok) {
          const data = await res.json();
          setProducts(data.items || []);
        }
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    };
    
    if (query) {
       fetchResults();
    } else {
       setProducts([]);
       setLoading(false);
    }
  }, [query]);

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)]">
      <div className="w-full bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 pt-8 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
             <SearchIcon className="w-6 h-6 text-[var(--color-primary-base)]" />
             Resultados para "{query}"
           </h1>
           <p className="text-slate-500 mt-2">
             {loading ? 'Buscando...' : `${products.length} produto(s) encontrado(s)`}
           </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {loading ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 animate-pulse dark:bg-slate-900/50 dark:border-slate-800">
                    <div className="bg-slate-200 dark:bg-slate-800 rounded-xl h-48 w-full mb-4"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-4"></div>
                  </div>
                ))}
             </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {products.map(p => (
              <ProductCard 
                key={p.id} 
                product={p} 
                onAddToCart={(prod, qty) => console.log('Add to cart clicked:', prod.name, qty)} 
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center flex flex-col items-center bg-white rounded-3xl border border-slate-200 border-dashed dark:bg-slate-900/50 dark:border-slate-800 shadow-sm max-w-2xl mx-auto">
             <PackageOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
             <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Nenhum produto encontrado</h3>
             <p className="text-slate-500 dark:text-slate-500 max-w-md mt-2">
               Não encontramos nenhum título com o termo "{query}". Tente buscar por outro nome de livro, autor, editora ou ISBN.
             </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
       <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] flex flex-col items-center justify-center">
         <SearchIcon className="animate-spin text-slate-400 w-8 h-8"/>
         <p className="text-slate-500 mt-4">Carregando busca...</p>
       </div>
    }>
      <SearchResults />
    </Suspense>
  );
}
