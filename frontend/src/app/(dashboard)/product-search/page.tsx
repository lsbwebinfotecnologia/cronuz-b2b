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
            className="inline-flex items-center gap-2 rounded-xl bg-[#00b4b4] hover:bg-[#009999] text-white px-5 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
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
              className="w-full space-y-6"
            >
              {/* ── Múltiplos resultados: carrossel horizontal de seleção rápida ── */}
              {products.length > 1 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Search className="w-4 h-4 text-[#00b4b4]" />
                      {products.length} produtos encontrados — selecione para ver estoque:
                    </p>
                    <span className="text-[11px] text-slate-400">Clique para alternar</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                    {products.map(p => {
                      const isActive = product?.COD_ITEM === p.COD_ITEM;
                      return (
                        <button
                          key={p.COD_ITEM}
                          onClick={() => selectProduct(p)}
                          className={`flex-shrink-0 flex items-center gap-3 text-left rounded-xl border p-2.5 min-w-[240px] max-w-[300px] transition-all
                            ${isActive
                              ? 'border-[#00b4b4] bg-[#00b4b4]/10 shadow-sm ring-2 ring-[#00b4b4]/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-[#00b4b4]/50 bg-slate-50/50 dark:bg-slate-800/40'
                            }`}
                        >
                          {p.COVER_URL ? (
                            <img
                              src={p.COVER_URL}
                              alt=""
                              className="w-10 h-14 object-contain rounded bg-white dark:bg-slate-900 shadow-xs shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-14 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                              <BookOpen className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                              {p.NOM_ITEM}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1 truncate">
                              {p.COD_BARRA_ITEM ? `ISBN: ${p.COD_BARRA_ITEM}` : `Cód: ${p.COD_ITEM}`}
                            </p>
                            {isActive && (
                              <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-[#00b4b4]">
                                ● Visualizando
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── GRID PRINCIPAL: COLUNA 5 (PRODUTO) E COLUNA 7 (ESTOQUES) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* ── COLUNA DE 5: CARD DO PRODUTO (STICKY) ── */}
                <div className="lg:col-span-5 lg:sticky lg:top-4">
                  {product ? (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col">
                      {/* Capa com destaque */}
                      <div className="w-full p-6 flex items-center justify-center bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        {product.COVER_URL ? (
                          <img
                            src={product.COVER_URL}
                            alt={`Capa de ${product.NOM_ITEM}`}
                            className="max-h-72 w-auto object-contain rounded-xl shadow-md border border-slate-200/60 dark:border-slate-700"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-40 h-56 rounded-xl bg-slate-200 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 gap-2 border border-slate-200 dark:border-slate-700">
                            <BookOpen className="w-10 h-10 opacity-40" />
                            <span className="text-xs font-medium">Sem imagem</span>
                          </div>
                        )}
                      </div>

                      {/* Informações detalhadas */}
                      <div className="p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {product.SITUACAO_ITEM && (
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${situacaoLabel(product.SITUACAO_ITEM).color}`}>
                                {situacaoLabel(product.SITUACAO_ITEM).label}
                              </span>
                            )}
                            {product.TIPO && (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {product.TIPO}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono text-slate-400">
                            Cód. Horus: <strong className="text-slate-700 dark:text-slate-200">#{product.COD_ITEM}</strong>
                          </span>
                        </div>

                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                          {product.NOM_ITEM}
                        </h2>

                        {/* Preço e saldo geral */}
                        <div className="flex flex-wrap items-baseline justify-between gap-3 pt-1">
                          {product.VLR_CAPA ? (
                            <span className="text-3xl font-black text-[#00b4b4]">
                              {formatPrice(product.VLR_CAPA)}
                            </span>
                          ) : (
                            <span className="text-lg font-bold text-slate-400">Preço não informado</span>
                          )}

                          {product.SALDO_DISPONIVEL !== undefined && (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold">
                              <Package className="w-4 h-4 text-slate-400" />
                              <span>Saldo Geral Horus: <strong className="text-[#00b4b4]">{product.SALDO_DISPONIVEL} un.</strong></span>
                            </div>
                          )}
                        </div>

                        {/* Metadados */}
                        <div className="space-y-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                          {product.COD_BARRA_ITEM && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">ISBN / Barras:</span>
                              <span className="font-mono font-semibold">{product.COD_BARRA_ITEM}</span>
                            </p>
                          )}
                          {product.NOM_EDITORA && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">Editora:</span>
                              <span className="font-medium">{product.NOM_EDITORA}</span>
                            </p>
                          )}
                          {product.SELO && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">Selo:</span>
                              <span className="font-medium">{product.SELO}</span>
                            </p>
                          )}
                          {(product.GENERO_NIVEL_1 || product.GENERO_NIVEL_2) && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">Gênero:</span>
                              <span className="font-medium">{[product.GENERO_NIVEL_1, product.GENERO_NIVEL_2].filter(Boolean).join(' › ')}</span>
                            </p>
                          )}
                        </div>

                        {/* Sinopse */}
                        {product.DESC_SINOPSE && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sinopse</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-4">
                              {product.DESC_SINOPSE}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                      <AlertCircle className="w-8 h-8" />
                      <p className="text-sm font-medium">Nenhum produto selecionado.</p>
                    </div>
                  )}
                </div>

                {/* ── COLUNA DE 7: ESTOQUES DAS LOJAS + DISTRIBUIDORAS ── */}
                <div className="lg:col-span-7 space-y-6">

                  {/* 1. ESTOQUE POR LOJA / FILIAL (HORUS) */}
                  <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#00b4b4]/10 flex items-center justify-center text-[#00b4b4]">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            Estoque por Loja / Filial (Horus)
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Locais de estoque configurados.
                          </p>
                        </div>
                      </div>
                      {product && stockData.length > 0 && (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {stockData.length} filial(is)
                        </span>
                      )}
                    </div>

                    {stockLoading && (
                      <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin text-[#00b4b4]" />
                        <span className="text-sm font-medium">Consultando saldo nas filiais do Horus…</span>
                      </div>
                    )}

                    {!stockLoading && !product && (
                      <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
                        <MapPin className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Realize uma busca para ver o saldo por filial.</p>
                      </div>
                    )}

                    {!stockLoading && product && stockData.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="py-3 px-5">Filial / Loja</th>
                              <th className="py-3 px-3 text-center">Empresa / Filial</th>
                              <th className="py-3 px-3 text-center">Situação</th>
                              <th className="py-3 px-5 text-right">Saldo Disponível</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {stockData.map((b, idx) => {
                              const sit = situacaoLabel(b.situacao_item);
                              return (
                                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="py-3 px-5">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">{b.filial_nome}</p>
                                    {b.erro && <p className="text-[11px] text-red-500 mt-0.5">{b.erro}</p>}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                      Emp {b.cod_empresa || '—'} · Fil {b.cod_filial || '—'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {b.situacao_item ? (
                                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sit.color}`}>
                                        {sit.label}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-5 text-right">
                                    <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-bold
                                      ${b.saldo > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                      {b.saldo} un
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!stockLoading && product && stockData.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <MapPin className="w-8 h-8 opacity-40" />
                        <p className="text-sm font-medium">Nenhuma filial configurada ou sem dados de estoque.</p>
                        <p className="text-xs">
                          Configure em{' '}
                          <a href="/logistics/branches" className="text-[#00b4b4] underline hover:no-underline">
                            Logística Horus → Filiais do Seller
                          </a>.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2. ESTOQUE DOS DISTRIBUIDORES */}
                  {(distLoading || distData.length > 0) && (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                            <Truck className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                              Estoque Distribuidores Parceiros
                            </h3>
                          </div>
                        </div>
                        {distLoading && (
                          <div className="flex items-center gap-2 text-xs text-[#00b4b4] font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Consultando…</span>
                          </div>
                        )}
                      </div>

                      {distLoading && distData.length === 0 ? (
                        <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                          <span className="text-sm font-medium">Consultando saldo nos distribuidores…</span>
                        </div>
                      ) : (
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {distData.map((d, i) => {
                            const colors: Record<string, { border: string; bg: string; badge: string; text: string }> = {
                              catavento: { border: '#16a34a', bg: 'rgba(22, 163, 74, 0.04)', badge: '#16a34a', text: '#15803d' },
                              disal:     { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.04)', badge: '#2563eb', text: '#1d4ed8' },
                            };
                            const conf = colors[d.slug] || { border: '#00b4b4', bg: 'rgba(0, 180, 180, 0.04)', badge: '#00b4b4', text: '#008a8a' };

                            return (
                              <div
                                key={i}
                                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden"
                                style={{ borderLeftColor: conf.border, borderLeftWidth: 4, backgroundColor: conf.bg }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{d.name}</h4>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distribuidor</span>
                                  </div>
                                  <span
                                    className="inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold shrink-0"
                                    style={{
                                      background: d.saldo > 0 ? `${conf.badge}20` : '#f1f5f9',
                                      color:      d.saldo > 0 ? conf.text : '#94a3b8',
                                    }}
                                  >
                                    {d.saldo} un
                                  </span>
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                                  {d.error ? (
                                    <span className="text-red-500 flex items-center gap-1 text-[11px]">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      {d.error}
                                    </span>
                                  ) : !d.found ? (
                                    <span className="text-slate-400 text-[11px]">Não encontrado</span>
                                  ) : (
                                    <>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                                        ● Disponível
                                      </span>
                                      {d.preco && (
                                        <span className="font-bold text-slate-700 dark:text-slate-200">
                                          R$ {d.preco.toFixed(2).replace('.', ',')}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
