'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Sparkles, 
  Search, 
  Plus, 
  Trash2, 
  Loader2, 
  Database, 
  BookOpen, 
  Tag, 
  Check, 
  Layers, 
  AlertCircle,
  ExternalLink,
  DollarSign,
  PackageCheck
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface ProductItem {
  id: number;
  showcase_id: number;
  product_id: number;
  position: number;
  product?: {
    id: number;
    name: string;
    sku?: string;
    ean_gtin?: string;
    base_price: number;
    promotional_price?: number;
    brand?: string;
    cover_url?: string;
    stock_quantity: number;
  };
}

interface ShowcaseDetail {
  id: number;
  title: string;
  description?: string;
  search_source: 'CRONUZ' | 'HORUS_API';
  active: boolean;
  display_order: number;
  start_date?: string | null;
  end_date?: string | null;
  is_currently_active?: boolean;
  items: ProductItem[];
}

export default function ShowcaseItemsManagementPage() {
  const params = useParams();
  const router = useRouter();
  const showcaseId = params.id as string;

  const [showcase, setShowcase] = useState<ShowcaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const fetchShowcase = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/${showcaseId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setShowcase(data);
      } else {
        toast.error('Vitrine não encontrada.');
        router.push('/marketing/dynamic-showcases');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao carregar vitrine.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showcaseId) {
      fetchShowcase();
    }
  }, [showcaseId]);

  // Debounce Search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/${showcaseId}/search?q=${encodeURIComponent(searchQuery.trim())}&limit=30`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || []);
          if (data.warning) {
            toast.warning(data.warning);
          }
        } else {
          toast.error('Falha ao buscar produtos.');
        }
      } catch (err) {
        console.error(err);
        toast.error('Erro de comunicação na busca.');
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery, showcaseId]);

  const handleAddItem = async (item: any) => {
    const itemKey = item.isbn || item.product_id || item.horus_cod_item;
    setAddingId(itemKey);

    try {
      const token = getToken();
      const payload = {
        product_id: item.product_id || null,
        horus_cod_item: item.horus_cod_item || null,
        isbn: item.isbn || null,
        title: item.title || null,
        description: item.description || null,
        publisher: item.publisher || null,
        category_name: item.category_name || null,
        cover_url: item.cover_url || null,
        base_price: Number(item.base_price) || 0.0,
        promotional_price: item.promotional_price ? Number(item.promotional_price) : null,
        stock_quantity: Number(item.stock_quantity) || 0,
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/${showcaseId}/items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const data = await res.json();
        toast.success(
          item.source === 'HORUS_API' && !item.exists_in_cronuz
            ? 'Produto cadastrado no Cronuz e adicionado à vitrine!'
            : 'Produto adicionado à vitrine com sucesso!'
        );
        // Atualiza estado de busca marcando como adicionado
        setSearchResults(prev =>
          prev.map(p => {
            const currentKey = p.isbn || p.product_id || p.horus_cod_item;
            if (currentKey === itemKey) {
              return { ...p, already_added: true, product_id: data.product_id };
            }
            return p;
          })
        );
        // Recarrega lista da vitrine
        fetchShowcase();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Não foi possível adicionar o produto.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao adicionar produto.');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveItem = async (productId: number, title?: string) => {
    if (!confirm(`Remover "${title || 'este produto'}" da vitrine?`)) return;

    setRemovingId(productId);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/${showcaseId}/items/${productId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (res.ok) {
        toast.success('Produto removido da vitrine.');
        // Atualiza busca local se estiver aberto
        setSearchResults(prev =>
          prev.map(p => {
            if (p.product_id === productId) {
              return { ...p, already_added: false };
            }
            return p;
          })
        );
        fetchShowcase();
      } else {
        toast.error('Erro ao remover produto.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao remover produto.');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm text-slate-500">Carregando detalhes da vitrine...</p>
      </div>
    );
  }

  if (!showcase) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header com Breadcrumb */}
      <div className="space-y-3">
        <Link
          href="/marketing/dynamic-showcases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Vitrines Dinâmicas
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-1">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{showcase.title}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                showcase.search_source === 'HORUS_API'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40'
              }`}>
                <Database className="w-3 h-3" />
                {showcase.search_source === 'HORUS_API' ? 'Busca no Horus ERP' : 'Busca no Cronuz'}
              </span>

              {(showcase.is_currently_active ?? showcase.active) ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                  Vigente
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40">
                  Expirada / Inativa
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {showcase.description || 'Vitrine temática dinâmica'} • {showcase.items.length} {showcase.items.length === 1 ? 'produto adicionado' : 'produtos adicionados'}
              {(showcase.start_date || showcase.end_date) && (
                <span className="block sm:inline sm:ml-2 text-xs text-slate-400">
                  • Período: {showcase.start_date ? new Date(showcase.start_date).toLocaleDateString('pt-BR') : 'Início imediato'} até {showcase.end_date ? new Date(showcase.end_date).toLocaleDateString('pt-BR') : 'tempo ilimitado'}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Grid Principal: 2 Colunas no Desktop (Busca à esquerda/topo, Itens da Vitrine à direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA 1: Buscar e Adicionar Produtos (5 Colunas no Desktop) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600" />
                Pesquisar & Adicionar Produtos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {showcase.search_source === 'HORUS_API'
                  ? 'Pesquise por Nome, ISBN ou Código no Horus ERP. Se o item não existir no Cronuz, ele será auto-cadastrado ao adicionar.'
                  : 'Pesquise por Nome, ISBN ou Código no catálogo local do Cronuz.'}
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Digite nome, ISBN ou código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
              {searching && (
                <Loader2 className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-600 animate-spin" />
              )}
            </div>

            {/* Lista de Resultados da Busca */}
            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
              {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  Nenhum produto encontrado para "{searchQuery}".
                </div>
              )}

              {searchResults.map((item, idx) => {
                const itemKey = item.isbn || item.product_id || item.horus_cod_item || idx;
                const isAdding = addingId === itemKey;
                const isAdded = item.already_added;

                return (
                  <div
                    key={itemKey}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/50 bg-slate-50/50 dark:bg-slate-800/30 transition flex items-start gap-3"
                  >
                    {/* Imagem / Capa */}
                    <div className="w-14 h-20 rounded-lg bg-slate-200 dark:bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center relative border border-slate-200 dark:border-slate-700">
                      {item.cover_url ? (
                        <img
                          src={item.cover_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e: any) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <BookOpen className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    {/* Detalhes do Produto */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight">
                        {item.title}
                      </h4>
                      
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 mt-1">
                        {item.isbn && <div>ISBN: <span className="font-mono">{item.isbn}</span></div>}
                        {item.publisher && <div>Editora: {item.publisher}</div>}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                            R$ {(item.base_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {item.stock_quantity !== undefined && (
                            <span className="text-[10px] text-slate-400">
                              Estoque: {item.stock_quantity}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botão de Ação */}
                      <div className="mt-2.5">
                        {isAdded ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                            <Check className="w-3 h-3" />
                            Na Vitrine
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddItem(item)}
                            disabled={isAdding}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[11px] font-semibold transition shadow-xs disabled:opacity-50 cursor-pointer"
                          >
                            {isAdding ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Adicionar à Vitrine
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUNA 2: Produtos Já Vinculados na Vitrine (7 Colunas no Desktop) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Produtos da Vitrine ({showcase.items.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Estes são os produtos atualmente exibidos e associados a esta vitrine dinâmica.
                </p>
              </div>
            </div>

            {showcase.items.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <PackageCheck className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vitrine sem produtos
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Utilize o painel de pesquisa ao lado para encontrar e adicionar os livros a esta vitrine.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {showcase.items.map((item, index) => {
                  const prod = item.product;
                  const isRemoving = removingId === item.product_id;

                  return (
                    <div
                      key={item.id}
                      className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-7 text-center font-mono text-xs font-bold text-slate-400">
                          #{index + 1}
                        </div>

                        {/* Capa */}
                        <div className="w-12 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-700">
                          {prod?.cover_url ? (
                            <img
                              src={prod.cover_url}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                              onError={(e: any) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <BookOpen className="w-5 h-5 text-slate-400" />
                          )}
                        </div>

                        {/* Informações */}
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {prod?.name || 'Produto sem título'}
                          </h4>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            {prod?.ean_gtin && <span>ISBN: {prod.ean_gtin}</span>}
                            {prod?.brand && <span>Editora: {prod.brand}</span>}
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              R$ {(prod?.base_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Botão Remover */}
                      <button
                        onClick={() => handleRemoveItem(item.product_id, prod?.name)}
                        disabled={isRemoving}
                        className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition flex-shrink-0 cursor-pointer disabled:opacity-50"
                        title="Remover da vitrine"
                      >
                        {isRemoving ? (
                          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
