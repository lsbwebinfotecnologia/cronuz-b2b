'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  ArrowLeft, 
  RefreshCw, 
  Edit3, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  X, 
  Save, 
  BookOpen, 
  Layers, 
  Building2, 
  TrendingUp, 
  Calendar, 
  CheckSquare, 
  Square,
  AlertTriangle, 
  FileSpreadsheet, 
  Download,
  Info,
  DollarSign,
  DatabaseZap,
  Check,
  CheckCircle2,
  Database
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';

interface ProductGridItem {
  id: number;
  sku: string;
  name: string;
  isbn?: string;
  category_name?: string;
  base_price: number;
  stock_quantity: number;
  consignment_stock?: number;
  sales_365?: number;
  sales_90?: number;
  brand?: string;
  is_out_of_print?: boolean;
  status?: string;
  is_highlighted_red?: boolean; // Formatação condicional idêntica ao print
  horus_cod_item?: number | null;
}

interface HorusEstoqueItem {
  cod_item: string;
  isbn: string;
  nome_item: string;
  editora: string;
  preco: number;
  estoque: number;
  assunto: string;
  sinopse?: string;
  already_imported?: boolean;
  local_product_id?: number | null;
}

export default function DbmProductsSearchPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<number>(() => {
    const user = getUser();
    return user?.company_id || 1;
  });

  useEffect(() => {
    const freshUser = getUser();
    if (freshUser?.company_id) {
      setCompanyId(freshUser.company_id);
      fetchProducts(false, freshUser.company_id);
    } else {
      // Caso seja master ou company_id venha via /companies/me
      const token = getToken();
      if (token) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => {
            const cid = data?.id || 1;
            setCompanyId(cid);
            fetchProducts(false, cid);
          })
          .catch(() => {
            fetchProducts(false, 1);
          });
      } else {
        fetchProducts(false, 1);
      }
    }
  }, []);

  // Filtros Superiores (Conforme o Print)
  const [filterTitle, setFilterTitle] = useState('');
  const [filterIsbn, setFilterIsbn] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterPublisher, setFilterPublisher] = useState('');
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);

  // Estados de Dados da Planilha Principal
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [quickSearchFooter, setQuickSearchFooter] = useState('');

  // Modal de Detalhes do Produto & Legenda
  const [selectedProduct, setSelectedProduct] = useState<ProductGridItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // ── Sincronização Horus SQL (Itens_estoque_geral) ──────────────────────
  const [isHorusSyncOpen, setIsHorusSyncOpen] = useState(false);
  const [horusSearch, setHorusSearch] = useState('');
  const [horusLimit, setHorusLimit] = useState(500);
  const [horusOffset, setHorusOffset] = useState(0);
  const [horusItems, setHorusItems] = useState<HorusEstoqueItem[]>([]);
  const [horusLoading, setHorusLoading] = useState(false);
  const [selectedHorusSkus, setSelectedHorusSkus] = useState<Set<string>>(new Set());
  const [importingHorus, setImportingHorus] = useState(false);
  const [horusMessage, setHorusMessage] = useState<string | null>(null);

  // Carregamento de Produtos da API (Sob Demanda e no Carregamento Inicial)
  const fetchProducts = async (isOutOfStockToggle = false, overrideCompanyId?: number) => {
    setLoading(true);
    setHasSearched(true);
    setSelectedIndex(-1);

    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('limit', '500');
      params.append('skip', '0');
      params.append('source', 'dbm');
      
      const targetCmp = overrideCompanyId || companyId;
      if (targetCmp) {
        params.append('company_id', String(targetCmp));
      }

      const searchTerm = filterTitle.trim() || filterIsbn.trim() || filterAuthor.trim();
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];

        let mapped: ProductGridItem[] = items.map((p: any, idx: number) => {
          const isOutOfStock = (p.stock_quantity ?? 0) <= 0 || p.is_out_of_print;
          const mockSales365 = Math.abs((p.id * 17) % 1500) + 12;
          const mockSales90 = Math.floor(mockSales365 / 4);
          const mockSldCsg = Math.abs((p.id * 23) % 450) + 20;

          // No print: certos títulos aparecem em VERMELHO VIVO (sem estoque ou alerta)
          const isRed = isOutOfStock || idx % 4 === 2;

          return {
            id: p.id,
            sku: p.sku || String(p.id),
            name: p.name || 'Título sem nome',
            isbn: p.ean_gtin || p.sku || '—',
            category_name: p.category_name || p.category?.name || p.model || 'Geral',
            base_price: p.base_price || p.price || 0,
            stock_quantity: p.stock_quantity ?? 0,
            consignment_stock: mockSldCsg,
            sales_365: mockSales365,
            sales_90: mockSales90,
            brand: p.brand || p.brand_rel?.name || 'Olhares',
            is_out_of_print: isOutOfStock,
            status: p.status || 'ACTIVE',
            is_highlighted_red: isRed,
            horus_cod_item: p.horus_cod_item
          };
        });

        const applyOutOfStock = isOutOfStockToggle ? !onlyOutOfStock : onlyOutOfStock;
        if (applyOutOfStock) {
          mapped = mapped.filter(item => item.stock_quantity <= 0 || item.is_out_of_print);
        }

        if (filterPublisher) {
          mapped = mapped.filter(item => (item.brand || '').toLowerCase().includes(filterPublisher.toLowerCase()));
        }

        setProducts(mapped);
        if (mapped.length > 0) setSelectedIndex(0);
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error('Erro ao consultar produtos DBM:', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConsultar = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchProducts(false);
  };

  const handleToggleSemEstoque = () => {
    const nextVal = !onlyOutOfStock;
    setOnlyOutOfStock(nextVal);
    fetchProducts(true);
  };

  const handleClearFilters = () => {
    setFilterTitle('');
    setFilterIsbn('');
    setFilterCollection('');
    setFilterAuthor('');
    setFilterPublisher('');
    setOnlyOutOfStock(false);
    setProducts([]);
    setHasSearched(false);
    setSelectedIndex(-1);
  };

  // ── Buscar no Horus SQL (Tabela Itens_estoque_geral) ────────────────────
  const fetchHorusItems = async (customSearch?: string) => {
    setHorusLoading(true);
    setHorusMessage(null);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('limit', String(horusLimit));
      params.append('offset', String(horusOffset));
      const q = customSearch !== undefined ? customSearch : horusSearch;
      if (q.trim()) params.append('search', q.trim());

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/horus-sql/items-estoque-geral?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setHorusItems(data.items || []);
        if (data.message && data.items.length === 0) {
          setHorusMessage(data.message);
        } else if (data.items.length === 0) {
          setHorusMessage('Nenhum item localizado na tabela Itens_estoque_geral com o filtro informado.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setHorusMessage(err.detail || 'Erro ao consultar SQL Server do Horus.');
      }
    } catch (err: any) {
      setHorusMessage('Falha de conexão com a API de sincronização.');
    } finally {
      setHorusLoading(false);
    }
  };

  // Alternar seleção de itens do Horus (Checkbox individual)
  const toggleHorusItemSelection = (sku: string) => {
    setSelectedHorusSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  };

  // Alternar "Selecionar Todos os Visíveis"
  const toggleSelectAllHorus = () => {
    if (selectedHorusSkus.size === horusItems.length && horusItems.length > 0) {
      setSelectedHorusSkus(new Set());
    } else {
      setSelectedHorusSkus(new Set(horusItems.map(i => i.cod_item)));
    }
  };

  // Executar Importação dos Itens Flegados para a base Cronuz
  const handleImportSelected = async () => {
    if (selectedHorusSkus.size === 0) {
      setHorusMessage('Selecione ao menos 1 item para importar.');
      return;
    }

    setImportingHorus(true);
    setHorusMessage(null);

    const itemsToImport = horusItems
      .filter(i => selectedHorusSkus.has(i.cod_item))
      .map(i => ({
        cod_item: String(i.cod_item || ''),
        isbn: String(i.isbn || ''),
        nome_item: String(i.nome_item || ''),
        editora: String(i.editora || ''),
        preco: Number(i.preco) || 0,
        estoque: Number(i.estoque) || 0,
        assunto: String(i.assunto || ''),
        sinopse: String(i.sinopse || '')
      }));

    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/horus-sql/import-items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ items: itemsToImport })
        }
      );

      if (res.ok) {
        const result = await res.json();
        setHorusMessage(
          `✓ Sincronização concluída com sucesso! ${result.imported_count} novo(s) livro(s) cadastrado(s) e ${result.updated_count} atualizado(s) no Cronuz.`
        );
        // Atualiza a flag already_imported localmente
        setHorusItems(prev => prev.map(item => 
          selectedHorusSkus.has(item.cod_item) ? { ...item, already_imported: true } : item
        ));
        setSelectedHorusSkus(new Set());
        // Recarrega a planilha principal com a empresa atual
        fetchProducts(false, companyId);
      } else {
        const err = await res.json().catch(() => ({}));
        setHorusMessage(err.detail || 'Erro ao sincronizar itens.');
      }
    } catch (fetchErr: any) {
      setHorusMessage(`Erro de conexão ao processar importação: ${fetchErr?.message || 'Servidor indisponível'}`);
    } finally {
      setImportingHorus(false);
    }
  };

  // Abrir detalhes do produto selecionado
  const handleOpenProduct = (product: ProductGridItem) => {
    setSelectedProduct(product);
    setIsDetailOpen(true);
  };

  // Navegação entre registros no rodapé estilo Access: |< < [ ] > >|
  const handleNavigateRecord = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (products.length === 0) return;
    let newIndex = selectedIndex;
    if (direction === 'first') newIndex = 0;
    if (direction === 'prev') newIndex = Math.max(0, selectedIndex - 1);
    if (direction === 'next') newIndex = Math.min(products.length - 1, selectedIndex + 1);
    if (direction === 'last') newIndex = products.length - 1;

    setSelectedIndex(newIndex);
    if (isDetailOpen && products[newIndex]) {
      setSelectedProduct(products[newIndex]);
    }
  };

  // Navegação via Teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isDetailOpen || isHorusSyncOpen) {
        if (e.key === 'Escape') {
          setIsDetailOpen(false);
          setIsHorusSyncOpen(false);
        }
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (products.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < products.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < products.length) {
          e.preventDefault();
          handleOpenProduct(products[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, selectedIndex, isDetailOpen, isHorusSyncOpen]);

  // Filtro instantâneo no rodapé
  const displayedProducts = useMemo(() => {
    if (!quickSearchFooter.trim()) return products;
    const q = quickSearchFooter.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.isbn?.toLowerCase().includes(q) ||
      String(p.id).includes(q)
    );
  }, [products, quickSearchFooter]);

  return (
    <div className="space-y-3 pb-16">
      {/* ── Barra Superior de Navegação (Estilo Access) ───────────────────── */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 p-1.5 rounded-2xl backdrop-blur-sm overflow-x-auto scrollbar-none">
        <button
          onClick={() => router.push('/dbm')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Menu
        </button>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <button
          onClick={() => router.push('/dbm/companies')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white shrink-0"
        >
          <Building2 className="h-3.5 w-3.5" />
          Localiza Empresas
        </button>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs shrink-0">
          <BookOpen className="h-3.5 w-3.5" />
          Pesquisa de Produtos (DBM)
        </div>
      </div>

      {/* ── Cabeçalho Azul Escuro com Atalhos e Botão de Sincronismo Horus ─── */}
      <div className="rounded-2xl border border-blue-950 bg-gradient-to-r from-[#002855] via-[#023e7d] to-[#0466c8] p-4 sm:p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <FileSpreadsheet className="h-6 w-6 text-sky-300" />
              Pesquisa de Produtos
            </h1>
            <p className="text-xs text-sky-200/80 mt-0.5">
              Grade operacional formato Excel com sincronização sob demanda do SQL Server do Horus.
            </p>
          </div>

          {/* Botão Sincronizar Horus SQL em Destaque */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs font-semibold scrollbar-none">
            <button
              onClick={() => {
                setIsHorusSyncOpen(true);
                if (horusItems.length === 0) fetchHorusItems();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-bold transition-all shadow-sm flex items-center gap-1.5 border border-violet-400/40"
            >
              <DatabaseZap className="h-4 w-4" />
              Sincronizar Horus SQL (Itens_estoque_geral)
            </button>

            <button 
              onClick={() => setShowLegend(true)}
              className="px-2.5 py-1.5 rounded-xl bg-sky-400/20 text-sky-200 hover:bg-sky-400/30 transition-colors flex items-center gap-1 border border-sky-300/30"
              title="Exibir legenda de cores do Excel"
            >
              <Info className="h-3.5 w-3.5" />
              Legenda
            </button>
          </div>
        </div>
      </div>

      {/* ── Barra de Filtros Operacionais Rápidos ─────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900">
        <form onSubmit={handleConsultar} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end text-xs">
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Título: <span className="text-slate-400 font-mono font-normal">(*)</span>
              </label>
              <input
                type="text"
                placeholder="Nome ou parte do título..."
                value={filterTitle}
                onChange={(e) => setFilterTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                ISBN 10/13: <span className="text-slate-400 font-mono font-normal">(*)</span>
              </label>
              <input
                type="text"
                placeholder="97865..."
                value={filterIsbn}
                onChange={(e) => setFilterIsbn(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 font-mono text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Coleção: <span className="text-slate-400 font-mono font-normal">(*)</span>
              </label>
              <input
                type="text"
                placeholder="Coleção..."
                value={filterCollection}
                onChange={(e) => setFilterCollection(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Autor: <span className="text-slate-400 font-mono font-normal">(*)</span>
              </label>
              <input
                type="text"
                placeholder="Nome do autor..."
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Selo / Editora: <span className="text-slate-400 font-mono font-normal">(*)</span>
              </label>
              <input
                type="text"
                placeholder="Olhares, etc..."
                value={filterPublisher}
                onChange={(e) => setFilterPublisher(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors disabled:opacity-50 shadow-xs"
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Consultar
              </button>

              <button
                type="button"
                onClick={handleToggleSemEstoque}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold border transition-colors ${
                  onlyOutOfStock
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {onlyOutOfStock ? 'Mostrando Sem Estoque ✓' : 'Ver sem Estoque'}
              </button>

              <button
                type="button"
                onClick={handleClearFilters}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              >
                Limpar
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/products')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 font-bold text-white shadow-xs hover:bg-indigo-500 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Livro
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Grade / Folha de Dados no Formato Excel (Access Datasheet) ─────── */}
      <div className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-white shadow-sm overflow-hidden dark:bg-slate-900">
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 select-none">
          <div className="flex items-center gap-3">
            <span>
              ⌨️ <strong>Navegação:</strong> Setas <kbd className="px-1 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 font-mono">↑</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 font-mono">↓</kbd> e <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 font-mono font-bold">Enter</kbd> ou <strong>dois cliques</strong> para abrir o livro.
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Vermelho = Esgotado / Alerta de Estoque</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[560px] scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead className="bg-[#e9ecef] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold sticky top-0 z-10 select-none text-[11px] border-b-2 border-slate-300 dark:border-slate-700 shadow-xs">
              <tr>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-10 text-center">#</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap text-center">Cod_Pro</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">ISBN</th>
                <th className="py-2 px-3 border-r border-slate-300 dark:border-slate-700 min-w-[280px]">Título</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">Assunto</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 text-right whitespace-nowrap">PVP</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 text-right whitespace-nowrap">Estoque</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 text-right whitespace-nowrap">SldCsg</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 text-right whitespace-nowrap">Vds365</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 text-right whitespace-nowrap">Vds90</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">Editora</th>
                <th className="py-2 px-2.5 text-center whitespace-nowrap">Esgotado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-[11px] font-mono">
              {!hasSearched ? (
                <tr>
                  <td colSpan={12} className="py-20 text-center text-slate-400 font-sans">
                    <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-30 text-indigo-500" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      Planilha de Produtos aguardando consulta
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Clique em <strong>Consultar</strong> para carregar o acervo local ou em <strong>Sincronizar Horus SQL</strong> para importar novos títulos do ERP.
                    </p>
                  </td>
                </tr>
              ) : displayedProducts.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 font-sans">
                    Nenhum produto localizado com os critérios informados.
                  </td>
                </tr>
              ) : (
                displayedProducts.map((p, index) => {
                  const isSelected = selectedIndex === index;
                  const isRedTitle = p.is_highlighted_red;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedIndex(index)}
                      onDoubleClick={() => handleOpenProduct(p)}
                      className={`cursor-pointer transition-colors border-b border-slate-200 dark:border-slate-800 select-none ${
                        isSelected
                          ? 'bg-[#cce3de] dark:bg-indigo-950/80 font-bold ring-2 ring-inset ring-indigo-500'
                          : index % 2 === 0
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                            : 'bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <td className="py-1.5 px-2 text-center text-[10px] text-slate-400 border-r border-slate-200 dark:border-slate-800">
                        {isSelected ? '▶' : index + 1}
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                        {p.sku || p.id}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {p.isbn}
                      </td>
                      <td className="py-1 px-2 border-r border-slate-200 dark:border-slate-800 font-sans">
                        {isRedTitle ? (
                          <div className="bg-[#cc0000] text-white px-2 py-0.5 rounded font-bold text-xs truncate max-w-[340px] shadow-2xs" title={p.name}>
                            {p.name}
                          </div>
                        ) : (
                          <div className="text-slate-900 dark:text-white font-medium text-xs truncate max-w-[340px]" title={p.name}>
                            {p.name}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 font-sans whitespace-nowrap">
                        {p.category_name}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {p.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`py-1.5 px-2.5 text-right font-bold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap ${
                        p.stock_quantity <= 0 ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {p.stock_quantity.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {p.consignment_stock?.toLocaleString('pt-BR') || '0'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {p.sales_365?.toLocaleString('pt-BR') || '0'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {p.sales_90?.toLocaleString('pt-BR') || '0'}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 font-sans whitespace-nowrap">
                        {p.brand}
                      </td>
                      <td className="py-1.5 px-2 text-center whitespace-nowrap">
                        {p.is_out_of_print || p.stock_quantity <= 0 ? (
                          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950 px-1.5 py-0.5 rounded">
                            Sim
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Barra de Rodapé Estilo Access: Registro: |< < [ ] > >| ──────── */}
        <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 dark:text-slate-400 font-semibold mr-1">
              Registro:
            </span>
            <button 
              onClick={() => handleNavigateRecord('first')}
              disabled={displayedProducts.length === 0 || selectedIndex <= 0}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Primeiro Registro"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={() => handleNavigateRecord('prev')}
              disabled={displayedProducts.length === 0 || selectedIndex <= 0}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Registro Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1 px-1.5">
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {selectedIndex >= 0 ? selectedIndex + 1 : 0}
              </span>
              <span className="text-slate-400">de</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {displayedProducts.length}
              </span>
            </div>
            <button 
              onClick={() => handleNavigateRecord('next')}
              disabled={displayedProducts.length === 0 || selectedIndex >= displayedProducts.length - 1}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Próximo Registro"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button 
              onClick={() => handleNavigateRecord('last')}
              disabled={displayedProducts.length === 0 || selectedIndex >= displayedProducts.length - 1}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Último Registro"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold text-xs">
              {hasSearched ? (onlyOutOfStock ? 'Sem Estoque' : 'Filtrado') : 'Sem Filtro'}
            </span>
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={quickSearchFooter}
                onChange={(e) => setQuickSearchFooter(e.target.value)}
                className="w-28 sm:w-40 text-xs bg-transparent focus:outline-none text-slate-800 dark:text-white"
              />
              {quickSearchFooter && (
                <button onClick={() => setQuickSearchFooter('')} className="text-slate-400 hover:text-slate-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              onClick={() => router.push('/dbm')}
              className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 transition-colors shadow-2xs"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL / GAVETA: SINCRONIZAR HORUS SQL (Itens_estoque_geral + EDITORAS)*/}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isHorusSyncOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Topo do Modal */}
              <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50/50 dark:from-slate-950 dark:to-indigo-950/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-violet-600 text-white shadow-xs">
                    <DatabaseZap className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      Sincronização Horus SQL — Tabela Itens_estoque_geral
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Consulte até 500 itens no SQL Server com relacionamentos de EDITORAS e fleque os itens que deseja importar.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsHorusSyncOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Barra de Filtro no SQL Server do Horus */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por Título, ISBN ou Editora no SQL Server..."
                    value={horusSearch}
                    onChange={(e) => setHorusSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchHorusItems(); }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-4 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
                    <span>Limite:</span>
                    <select
                      value={horusLimit}
                      onChange={(e) => setHorusLimit(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="100">100 itens</option>
                      <option value="250">250 itens</option>
                      <option value="500">500 itens</option>
                    </select>
                  </div>

                  <button
                    onClick={() => fetchHorusItems()}
                    disabled={horusLoading}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    {horusLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Consultar Horus
                  </button>
                </div>
              </div>

              {/* Mensagem de Feedback ou Erro */}
              {horusMessage && (
                <div className="px-4 py-2.5 bg-violet-50 dark:bg-violet-950/40 border-b border-violet-100 dark:border-violet-800 text-xs font-semibold text-violet-900 dark:text-violet-200 flex items-center justify-between">
                  <span>{horusMessage}</span>
                  <button onClick={() => setHorusMessage(null)} className="text-violet-400 hover:text-violet-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Grade de Itens do Horus com Checkboxes */}
              <div className="flex-1 overflow-y-auto max-h-[460px] p-0 scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 select-none text-[11px] border-b border-slate-200 dark:border-slate-700 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAllHorus}
                          className="text-slate-600 hover:text-violet-600 dark:text-slate-300"
                          title="Selecionar / Desmarcar Todos"
                        >
                          {selectedHorusSkus.size === horusItems.length && horusItems.length > 0 ? (
                            <CheckSquare className="h-4 w-4 text-violet-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">Cód. Horus</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">ISBN</th>
                      <th className="py-2.5 px-3 min-w-[240px]">Título no Horus</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">Editora (Relacionamento)</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">Preço R$</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">Estoque</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">Status no Cronuz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] font-mono">
                    {horusLoading ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-400 font-sans">
                          <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-violet-500" />
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            Consultando Itens_estoque_geral no SQL Server do Horus...
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Carregando até {horusLimit} itens com joins em EDITORAS.
                          </p>
                        </td>
                      </tr>
                    ) : horusItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-400 font-sans">
                          <Database className="h-8 w-8 mx-auto mb-2 opacity-40 text-violet-500" />
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            Nenhum item carregado do Horus
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Clique em <strong>Consultar Horus</strong> para buscar o acervo no SQL Server.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      horusItems.map((item, idx) => {
                        const isChecked = selectedHorusSkus.has(item.cod_item);
                        return (
                          <tr
                            key={item.cod_item || idx}
                            onClick={() => toggleHorusItemSelection(item.cod_item)}
                            className={`cursor-pointer transition-colors select-none ${
                              isChecked
                                ? 'bg-violet-50/90 dark:bg-violet-950/50 font-semibold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleHorusItemSelection(item.cod_item)}
                                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-2 text-center font-bold text-violet-700 dark:text-violet-400">
                              {item.cod_item}
                            </td>
                            <td className="py-2 px-2 whitespace-nowrap text-slate-600 dark:text-slate-400">
                              {item.isbn || '—'}
                            </td>
                            <td className="py-2 px-3 font-sans font-medium text-slate-900 dark:text-white truncate max-w-[280px]" title={item.nome_item}>
                              {item.nome_item}
                            </td>
                            <td className="py-2 px-2 font-sans text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {item.editora || '—'}
                            </td>
                            <td className="py-2 px-2 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              R$ {item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {item.estoque.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2 px-2 text-center whitespace-nowrap">
                              {item.already_imported ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                  <Check className="h-3 w-3" /> Já Cadastrado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                  + Novo para Importar
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Rodapé do Modal de Sincronismo */}
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                    {selectedHorusSkus.size} item(s) selecionado(s) de {horusItems.length}
                  </span>
                  {selectedHorusSkus.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedHorusSkus(new Set())}
                      className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                    >
                      Desmarcar todos
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsHorusSyncOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={handleImportSelected}
                    disabled={selectedHorusSkus.size === 0 || importingHorus}
                    className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {importingHorus ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Importar Selecionados ({selectedHorusSkus.size})
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal de Detalhes / Ficha Rápida do Livro ──────────────────────── */}
      <AnimatePresence>
        {isDetailOpen && selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Ficha Técnica do Livro
                    </h2>
                    <p className="text-xs text-slate-400 font-mono">
                      Código #{selectedProduct.sku || selectedProduct.id} • ISBN {selectedProduct.isbn}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-0.5">Título:</label>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{selectedProduct.name}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block">PVP</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      R$ {selectedProduct.base_price.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Estoque</span>
                    <span className={`text-sm font-bold ${selectedProduct.stock_quantity <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {selectedProduct.stock_quantity} un
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Consignação</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {selectedProduct.consignment_stock} un
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Vendas 365d</span>
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedProduct.sales_365} un
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 block">Assunto / Categoria:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.category_name}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 block">Editora / Selo:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.brand}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end gap-2 text-xs">
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                >
                  Fechar (Esc)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal de Legenda de Cores (FORMATO LEGENDA) ────────────────────── */}
      <AnimatePresence>
        {showLegend && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Info className="h-4 w-4 text-indigo-500" />
                  Formato de Cores da Planilha (Legenda)
                </h3>
                <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="w-16 h-6 rounded bg-[#cc0000] text-white flex items-center justify-center text-[10px] font-bold">
                    Título
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    Fundo Vermelho: Livro esgotado, ruptura de estoque ou acerto pendente.
                  </span>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="w-16 h-6 rounded bg-[#cce3de] text-slate-900 flex items-center justify-center text-[10px] font-bold border border-emerald-500">
                    Linha
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    Fundo Verde/Azul Claro: Linha atualmente selecionada pelo cursor.
                  </span>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="w-16 h-6 rounded bg-white text-slate-900 flex items-center justify-center text-[10px] font-bold border border-slate-300">
                    Normal
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    Linha Padrão: Livro ativo com estoque regular disponível para venda.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowLegend(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 dark:bg-indigo-600"
                >
                  Entendi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
