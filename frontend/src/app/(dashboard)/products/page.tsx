'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  RefreshCw,
  Image as ImageIcon,
  SlidersHorizontal,
  ArrowUpDown,
  Filter,
  Package
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { ProductImage } from '@/components/store/ProductImage';

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [coverBaseUrl, setCoverBaseUrl] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number>(1);

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * limit;
      let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/?skip=${skip}&limit=${limit}`;
      if (searchTerm) {
        url += `&search=${encodeURIComponent(searchTerm)}`;
      }
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setTotal(data.total || 0);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Falha ao carregar catálogo.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao buscar produtos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        const compId = decoded.company_id || 1;
        setCompanyId(compId);
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${compId}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
           const data = await res.json();
           setCoverBaseUrl(data.cover_image_base_url || null);
        }
      } catch (e) {
        console.error("Error loading settings", e);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Produtos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gerencie o catálogo B2B de sua organização.</p>
        </div>
        
        <Link 
          href="/products/new"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          Adicionar Produto
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        
        {/* Superior Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50 dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center gap-3 flex-1 min-w-[300px]">
            <button onClick={fetchProducts} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300">
              <RefreshCw className="h-4 w-4" />
            </button>
            <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Procurar registros por Nome ou SKU" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-700 dark:text-white placeholder:text-slate-400"
              />
            </form>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <ArrowUpDown className="h-4 w-4 text-slate-400" /> Ordenar
            </button>
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <Filter className="h-4 w-4 text-slate-400" /> Filtros
            </button>
            <div className="px-3 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg font-medium ml-2 dark:bg-slate-800 dark:text-slate-300">
               {total > 0 ? `${(page - 1) * limit + 1} - ${Math.min(page * limit, total)} de ${total}` : '0 registros'}
            </div>
            {/* Pagination Controls */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
               <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-300 dark:hover:bg-slate-800"
               >
                 &larr;
               </button>
               <div className="w-px h-5 bg-slate-200 dark:bg-slate-700"></div>
               <button 
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= total}
                className="px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-300 dark:hover:bg-slate-800"
               >
                 &rarr;
               </button>
            </div>
          </div>
        </div>

        {/* Datagrid / Table */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--color-primary-base)]/50 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400 dark:border-[var(--color-primary-base)]/30">
                <th className="p-4 w-12 text-center">
                   <input type="checkbox" className="rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]" />
                </th>
                <th className="p-4 whitespace-nowrap hidden sm:table-cell">Capa</th>
                <th className="p-4 whitespace-nowrap">Nome</th>
                <th className="p-4 whitespace-nowrap">Tipo / SKU</th>
                <th className="p-4 whitespace-nowrap">Preço</th>
                <th className="p-4 whitespace-nowrap text-right pr-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin text-slate-400 mb-2" />
                      Carregando catálogo...
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 flex flex-col items-center dark:text-slate-400">
                    <Package className="h-10 w-10 text-slate-300 mb-3 dark:text-slate-600" />
                    <p>Nenhum produto listado ainda.</p>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={product.id}
                    onClick={() => router.push(`/products/${product.id}`)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer dark:hover:bg-slate-800/50"
                  >
                    <td className="p-4 text-center">
                      <input type="checkbox" onClick={(e) => e.stopPropagation()} className="rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)] dark:border-slate-700 dark:bg-slate-950" />
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700 relative overflow-hidden">
                        <ProductImage 
                          eanGtin={product.ean_gtin} 
                          alt={product.name}
                          baseUrl={coverBaseUrl}
                          companyIdProp={companyId}
                          className="w-full h-full object-cover p-1"
                          iconClassName="h-6 w-6 text-slate-400"
                        />
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        {product.brand_rel?.name || product.brand || 'Sem marca'}
                      </p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{product.sku}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Simples</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        {product.promotional_price && product.promotional_price < product.base_price ? (
                          <>
                            <span className="text-xs text-slate-400 line-through dark:text-slate-500">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.base_price || 0)}
                            </span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.promotional_price)}
                            </span>
                          </>
                        ) : (
                           <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-3">
                             {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.base_price || 0)}
                           </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right pr-6">
                      <span className={`text-sm font-bold ${product.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {product.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
