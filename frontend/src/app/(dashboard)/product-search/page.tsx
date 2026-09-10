'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Loader2,
  BookOpen,
  Package,
  AlertCircle,
  MapPin,
  BarChart3,
  Tag,
  Hash,
  Maximize2,
  Minimize2,
  X,
  Building2,
  Truck,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
type SearchOption = {
  value: 'BARRAS_ISBN' | 'NOME' | 'COD_ITEM';
  label: string;
  placeholder: string;
  icon: React.ElementType;
};

const SEARCH_OPTIONS: SearchOption[] = [
  { value: 'BARRAS_ISBN', label: 'ISBN / Cód. Barras', placeholder: 'Ex: 9788543112596', icon: Hash },
  { value: 'NOME',        label: 'Nome do Produto',    placeholder: 'Ex: O Alquimista',   icon: BookOpen },
  { value: 'COD_ITEM',    label: 'Código Horus',       placeholder: 'Ex: 12345',           icon: Tag },
];

type HorusProduct = {
  COD_ITEM: number;
  NOM_ITEM: string;
  COD_BARRA_ITEM?: string;
  COD_ISBN_ITEM?: string;
  NOM_EDITORA?: string;
  SELO?: string;
  GENERO_NIVEL_1?: string;
  GENERO_NIVEL_2?: string;
  VLR_CAPA?: string;
  SALDO_DISPONIVEL?: number;
  SITUACAO_ITEM?: string;
  SITUACAO_ITEM_DESC?: string;
  DESC_SINOPSE?: string;
  IMAGEM_ITEM?: string;
  TIPO?: string;
  STATUS_ITEM?: string;
  COVER_URL?: string | null;
};

type BranchStock = {
  filial_nome: string;
  cod_empresa: string;
  cod_filial: string;
  saldo: number;
  situacao_item?: string;
  registros_retornados?: number;
  erro?: string;
};

type DistributorResult = {
  slug: string;
  name: string;
  enabled: boolean;
  found: boolean;
  saldo: number;
  preco?: number | null;
  titulo?: string | null;
  error?: string | null;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function situacaoLabel(code?: string | null): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    IN: { label: 'Item Normal',              color: 'bg-emerald-100 text-emerald-700' },
    FD: { label: 'Em falta (Distrib.)',      color: 'bg-amber-100 text-amber-700' },
    FE: { label: 'Em falta (Editora)',       color: 'bg-amber-100 text-amber-700' },
    FC: { label: 'Fora de comercialização',  color: 'bg-red-100 text-red-700' },
    IP: { label: 'No Prelo',                 color: 'bg-sky-100 text-sky-700' },
  };
  return map[code ?? ''] ?? { label: code ?? '—', color: 'bg-slate-100 text-slate-600' };
}

function formatPrice(raw?: string): string {
  if (!raw) return '—';
  const num = parseFloat(raw.replace(',', '.'));
  if (isNaN(num)) return raw;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ──────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────
export default function ProductSearchPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [searchTerm, setSearchTerm]         = useState('');
  const [selectedOption, setSelectedOption] = useState<SearchOption>(SEARCH_OPTIONS[0]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [stockLoading, setStockLoading]     = useState(false);
  const [isFullscreen, setIsFullscreen]     = useState(false);

  const [product, setProduct]     = useState<HorusProduct | null>(null);
  const [products, setProducts]   = useState<HorusProduct[]>([]);
  const [stockData, setStockData] = useState<BranchStock[]>([]);
  const [searched, setSearched]   = useState(false);

  // Distribuidores
  const [distLoading, setDistLoading] = useState(false);
  const [distData,    setDistData]    = useState<DistributorResult[]>([]);

  // Dados do seller
  const [companyName, setCompanyName]   = useState('');
  const [companyLogo, setCompanyLogo]   = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega logo e nome do seller via dashboard/metrics
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${apiUrl}/dashboard/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.company_logo)  setCompanyLogo(data.company_logo);
      })
      .catch(() => {});

    // company_name vem do cookie/localStorage via getUser()
    try {
      const raw = localStorage.getItem('cronuz_b2b_user');
      const u = raw ? JSON.parse(raw) : null;
      if (u?.company_name) setCompanyName(u.company_name);
    } catch {}
  }, [apiUrl]);

  // Fechar fullscreen com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Busca produto ──────────────────────────
  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = searchTerm.trim();
    if (!term) { toast.error('Informe um valor para pesquisar.'); return; }

    setSearchLoading(true);
    setSearched(true);
    setProduct(null);
    setProducts([]);
    setStockData([]);

    try {
      const token = getToken();
      const params = new URLSearchParams({ term, search_option: selectedOption.value, limit: '10' });
      const res = await fetch(`${apiUrl}/product-search/product?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Nenhum produto encontrado.');
        return;
      }

      const data = await res.json();
      const items: HorusProduct[] = data.items || [];

      if (items.length === 0) { toast.error('Nenhum produto encontrado no Horus.'); return; }

      setProducts(items);
      selectProduct(items[0]);
    } catch {
      toast.error('Erro de conexão com a API.');
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm, selectedOption, apiUrl]);

  // ── Seleciona produto e busca estoque ─────
  const selectProduct = useCallback(async (p: HorusProduct) => {
    setProduct(p);
    setStockData([]);
    setDistData([]);
    if (!p.COD_ITEM) return;

    const token = getToken();

    // Horus stock + distribuidor em paralelo
    setStockLoading(true);
    setDistLoading(true);

    const isbn = p.COD_BARRA_ITEM || p.COD_ISBN_ITEM || '';

    const [horusRes, distRes] = await Promise.allSettled([
      fetch(`${apiUrl}/product-search/stock?cod_item=${p.COD_ITEM}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      isbn
        ? fetch(`${apiUrl}/product-search/distributor-stock?isbn=${encodeURIComponent(isbn)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : Promise.resolve(null),
    ]);

    // Horus
    if (horusRes.status === 'fulfilled' && horusRes.value?.ok) {
      const data = await horusRes.value.json();
      setStockData(data.branches || []);
    } else {
      toast.error('Erro ao consultar estoque no Horus.');
    }
    setStockLoading(false);

    // Distribuidores
    if (distRes.status === 'fulfilled' && distRes.value && (distRes.value as Response).ok) {
      const data = await (distRes.value as Response).json();
      setDistData(data.distributors || []);
    }
    setDistLoading(false);

  }, [apiUrl]);

  // ──────────────────────────────────────────
  // Content (reutilizado em normal e fullscreen)
  // ──────────────────────────────────────────
  const PageContent = (
    <div className="flex flex-col min-h-full">

      {/* ── Hero Header ────────────────────── */}
      <div className="relative overflow-hidden rounded-xl mb-5"
           style={{ background: 'linear-gradient(135deg, #00b4b4 0%, #007a7a 100%)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative flex items-center justify-between px-5 py-4">
          {/* Esquerda: logo + nome */}
          <div className="flex items-center gap-3">
            {companyLogo ? (
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/20 backdrop-blur-sm shadow-md flex-shrink-0 flex items-center justify-center border border-white/30">
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="w-full h-full object-contain p-1"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-lg bg-white/20 backdrop-blur-sm shadow-md flex-shrink-0 flex items-center justify-center border border-white/30">
                <Building2 className="w-6 h-6 text-white/80" />
              </div>
            )}
            <div>
              {companyName && (
                <p className="text-white/65 text-[10px] font-semibold tracking-wider uppercase leading-none mb-1">
                  {companyName}
                </p>
              )}
              <h1 className="text-white font-bold text-lg leading-tight flex items-center gap-1.5">
                <Search className="w-4 h-4 opacity-80" />
                Busca Preço
              </h1>
            </div>
          </div>

          {/* Direita: botão expandir */}
          <button
            onClick={() => setIsFullscreen(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-sm border border-white/20"
            title={isFullscreen ? 'Sair da tela cheia' : 'Expandir para tela cheia'}
          >
            {isFullscreen
              ? <><Minimize2 className="w-3.5 h-3.5" /> Minimizar</>
              : <><Maximize2 className="w-3.5 h-3.5" /> Expandir</>
            }
          </button>
        </div>
      </div>

      {/* ── Barra de busca ─────────────────── */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-5">
        {/* Radio options */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm shrink-0">
          {SEARCH_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selectedOption.value === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-1.5 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all select-none
                  ${active
                    ? 'bg-[#00b4b4] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <input
                  type="radio"
                  name="search_option"
                  value={opt.value}
                  checked={active}
                  onChange={() => { setSelectedOption(opt); inputRef.current?.focus(); }}
                  className="sr-only"
                />
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </label>
            );
          })}
        </div>

        {/* Input + botão */}
        <div className="flex flex-1 gap-2">
          <input
            ref={inputRef}
            type={selectedOption.value === 'COD_ITEM' ? 'number' : 'text'}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={selectedOption.placeholder}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00b4b4] hover:bg-[#009999] text-white px-5 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
          >
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>
      </form>

      {/* ── Resultado ──────────────────────── */}
      <div className="w-full">
        <AnimatePresence>
          {searched && !searchLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* ── Coluna produto ── */}

              {/* ── Strip horizontal de múltiplos resultados ── */}
              {products.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                >
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {products.length} resultados encontrados — selecione um:
                    </p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-thin scrollbar-thumb-slate-200">
                    {products.map(p => {
                      const isActive = product?.COD_ITEM === p.COD_ITEM;
                      return (
                        <button
                          key={p.COD_ITEM}
                          onClick={() => selectProduct(p)}
                          className={`flex-shrink-0 flex flex-col items-start text-left rounded-xl border px-3 py-2.5 min-w-[180px] max-w-[220px] transition-all duration-150
                            ${isActive
                              ? 'border-[#00b4b4] bg-[#00b4b4]/5 shadow-sm ring-1 ring-[#00b4b4]/30'
                              : 'border-slate-200 dark:border-slate-700 hover:border-[#00b4b4]/40 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                          {/* Mini capa */}
                          {p.COVER_URL ? (
                            <img
                              src={p.COVER_URL}
                              alt=""
                              className="w-8 h-10 object-contain rounded mb-1.5 bg-slate-50"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-8 h-10 rounded mb-1.5 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                              <BookOpen className="w-3.5 h-3.5 text-slate-300" />
                            </div>
                          )}
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                            {p.NOM_ITEM}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate w-full">
                            {p.COD_BARRA_ITEM || `#${p.COD_ITEM}`}
                          </p>
                          {isActive && (
                            <span className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-[#00b4b4]">
                              ● Selecionado
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* ── Grid principal: card produto + estoque ── */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

                {/* ── Coluna esquerda: card do produto (sticky) ── */}
                <div className="lg:col-span-2 lg:sticky lg:top-4">
                  {product ? (
                    <motion.div
                      key={product.COD_ITEM}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                    >
                      <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          Produto Selecionado
                        </p>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Capa */}
                        {product.COVER_URL && (
                          <div className="flex justify-center">
                            <img
                              src={product.COVER_URL}
                              alt={`Capa de ${product.NOM_ITEM}`}
                              className="h-48 object-contain rounded-lg shadow-md border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}

                        {/* Título e preço */}
                        <div>
                          <h2 className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{product.NOM_ITEM}</h2>
                          {product.VLR_CAPA && (
                            <p className="text-xl font-bold text-[#00b4b4] mt-1">{formatPrice(product.VLR_CAPA)}</p>
                          )}
                        </div>

                        {/* Situação */}
                        {product.SITUACAO_ITEM && (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${situacaoLabel(product.SITUACAO_ITEM).color}`}>
                            {situacaoLabel(product.SITUACAO_ITEM).label}
                          </span>
                        )}

                        {/* Metadados */}
                        <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                          {product.COD_BARRA_ITEM && <p><span className="text-slate-400">ISBN:</span> {product.COD_BARRA_ITEM}</p>}
                          {product.NOM_EDITORA    && <p><span className="text-slate-400">Editora:</span> {product.NOM_EDITORA}</p>}
                          {product.SELO           && <p><span className="text-slate-400">Selo:</span> {product.SELO}</p>}
                          {product.TIPO           && <p><span className="text-slate-400">Tipo:</span> {product.TIPO}</p>}
                          {product.GENERO_NIVEL_1 && (
                            <p>
                              <span className="text-slate-400">Gênero:</span>{' '}
                              {[product.GENERO_NIVEL_1, product.GENERO_NIVEL_2].filter(Boolean).join(' › ')}
                            </p>
                          )}
                          {product.COD_ITEM && <p><span className="text-slate-400">Cód. Horus:</span> {product.COD_ITEM}</p>}
                        </div>

                        {/* Saldo geral */}
                        {product.SALDO_DISPONIVEL !== undefined && (
                          <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2">
                            <Package className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-400">Saldo geral (Horus)</p>
                              <p className="font-semibold text-slate-800 dark:text-slate-100">{product.SALDO_DISPONIVEL} un.</p>
                            </div>
                          </div>
                        )}

                        {/* Sinopse */}
                        {product.DESC_SINOPSE && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-5">
                            {product.DESC_SINOPSE}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-8 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                      <AlertCircle className="w-8 h-8" />
                      <p className="text-sm">Nenhum produto encontrado.</p>
                      <p className="text-xs">Tente outro termo ou opção de busca.</p>
                    </div>
                  )}
                </div>

                {/* ── Coluna direita: estoque Horus + distribuidores (empilhados) ── */}
                <div className="lg:col-span-3 space-y-4">

                  {/* Estoque por Filial (Horus) */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800 px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Estoque por Filial
                      </p>
                      {product && (
                        <span className="text-xs text-slate-400">
                          Produto <strong className="text-slate-600 dark:text-slate-300">#{product.COD_ITEM}</strong>
                        </span>
                      )}
                    </div>

                    {stockLoading && (
                      <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Consultando saldo nas filiais…</span>
                      </div>
                    )}

                    {!stockLoading && !product && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <MapPin className="w-8 h-8" />
                        <p className="text-sm">Realize uma busca para ver o saldo por filial.</p>
                      </div>
                    )}

                    {!stockLoading && product && stockData.length > 0 && (
                      <>
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2 border-b border-slate-50 dark:border-slate-800">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Filial</span>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-28 text-center">Situação</span>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-20 text-right">Saldo</span>
                        </div>
                        {/* Rows */}
                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                          {stockData.map((b, idx) => {
                            const sit = situacaoLabel(b.situacao_item);
                            return (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                {/* Nome + sub-info */}
                                <div className="min-w-0">
                                  <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">{b.filial_nome}</p>
                                  {(b.cod_empresa || b.cod_filial) && (
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                      Emp {b.cod_empresa || '—'} · Fil {b.cod_filial || '—'}
                                    </p>
                                  )}
                                  {b.erro && <p className="text-[10px] text-red-500 mt-0.5">{b.erro}</p>}
                                </div>

                                {/* Situação */}
                                <div className="w-28 flex justify-center shrink-0">
                                  {b.situacao_item ? (
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${sit.color}`}>
                                      {sit.label}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-xs">—</span>
                                  )}
                                </div>

                                {/* Saldo */}
                                <div className="w-20 flex justify-end shrink-0">
                                  <span className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 text-xs font-bold min-w-[3rem]
                                    ${b.saldo > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {b.saldo} un
                                  </span>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {!stockLoading && product && stockData.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <MapPin className="w-8 h-8" />
                        <p className="text-sm">Nenhuma filial configurada ou sem dados de estoque.</p>
                        <p className="text-xs">
                          Configure em{' '}
                          <a href="/logistics/branches" className="text-[#00b4b4] underline hover:no-underline">
                            Logística Horus → Filiais do Seller
                          </a>.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Estoque Distribuidores — diretamente abaixo das filiais */}
                  {(distLoading || distData.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                    >
                      <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Estoque Distribuidores
                        </p>
                        {distLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400 ml-1" />}
                      </div>

                      {distLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Consultando distribuidores…</span>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                          {distData.map((d, i) => {
                            const colors: Record<string, string> = {
                              catavento: '#16a34a',
                              disal:     '#2563eb',
                            };
                            const color = colors[d.slug] || '#00b4b4';
                            return (
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.06 }}
                                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                              >
                                {/* Nome + detalhe */}
                                <div className="flex items-center gap-3">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ background: color }}
                                  />
                                  <div>
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{d.name}</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                      {d.error ? (
                                        <span className="text-red-500 flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3 shrink-0" />{d.error}
                                        </span>
                                      ) : !d.found ? (
                                        'Produto não encontrado neste distribuidor'
                                      ) : (
                                        <>
                                          Disponível
                                          {d.preco ? ` · R$ ${d.preco.toFixed(2).replace('.', ',')}` : ''}
                                        </>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {/* Saldo badge */}
                                <span
                                  className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold flex-shrink-0"
                                  style={{
                                    background: d.saldo > 0 ? `${color}18` : '#f1f5f9',
                                    color:      d.saldo > 0 ? color : '#94a3b8',
                                  }}
                                >
                                  {d.saldo} un
                                </span>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Estado inicial vazio */}
        {!searched && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Search className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">Nenhuma busca realizada</p>
            <p className="text-xs">Use a barra acima para consultar um produto por ISBN, nome ou código Horus.</p>
          </div>
        )}
      </div>
    </div>
  );

  // Portal do fullscreen — renderizado direto no document.body para escapar
  // de qualquer stacking context (backdrop-blur, z-index, overflow) do layout pai
  const FullscreenPortal = isFullscreen && typeof document !== 'undefined'
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            overflowY: 'auto',
            background: 'var(--color-bg-primary, #f8fafc)',
          }}
        >
          {/* Botão fechar */}
          <button
            onClick={() => setIsFullscreen(false)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0',
              color: '#475569',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
            Sair da tela cheia
          </button>
          {PageContent}
        </div>,
        document.body
      )
    : null;

  // ──────────────────────────────────────────
  // Normal layout — sem padding extra (o layout já tem p-6)
  // ──────────────────────────────────────────
  return (
    <>
      {FullscreenPortal}
      <div>{PageContent}</div>
    </>
  );
}
