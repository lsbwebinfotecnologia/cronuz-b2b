'use client';

import { useState, useEffect } from 'react';
import {
  Zap,
  Search,
  Sparkles,
  CheckCircle2,
  Package,
  Loader2,
  Database,
  FileSpreadsheet,
  Tag,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { MeliStepHeader, MeliAccessFooter } from '@/components/mercadolivre/MeliStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface CandidateItem {
  source: string;
  product_id: number | null;
  horus_cod_item: number | null;
  sku: string;
  ean_gtin: string;
  name: string;
  description?: string;
  author: string;
  publisher: string;
  brand: string;
  base_price: number;
  calculated_meli_price: number;
  raw_stock: number;
  effective_meli_stock: number;
  cover_url: string | null;
  suggested_category_id: string;
  suggested_category_name: string;
  existing_listing: {
    id: number;
    meli_item_id: string;
    status: string;
    meli_price: number;
    current_stock: number;
    permalink: string | null;
  } | null;
  auto_attributes: Array<{ id: string; value_name: string }>;
}

export default function MercadoLivrePublishPage() {
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceMode, setSourceMode] = useState<'AUTO' | 'LOCAL' | 'HORUS'>('AUTO');
  const [onlyUnlisted, setOnlyUnlisted] = useState(true);

  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, { id: string; name: string }>
  >({});
  const [predictingKey, setPredictingKey] = useState<string | null>(null);

  const getItemKey = (c: CandidateItem) =>
    `${c.source}_${c.product_id || c.horus_cod_item || c.ean_gtin || c.sku}`;

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.set('source', sourceMode);
      params.set('only_unlisted', String(onlyUnlisted));
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`${API_URL}/mercadolivre/catalog-candidates?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.items || [];
        setItems(list);
        setActiveIndex(0);
      } else {
        toast.error('Não foi possível carregar os produtos candidatos.');
      }
    } catch {
      toast.error('Erro de conexão ao consultar o catálogo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [sourceMode, onlyUnlisted]);

  // Navegação por teclado estilo Planilha Excel / Access Moderno
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(items.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(items.length - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        const curr = items[activeIndex];
        if (curr) {
          const k = getItemKey(curr);
          setSelectedKeys((prev) => ({ ...prev, [k]: !prev[k] }));
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        handlePublishSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, activeIndex, selectedKeys]);

  const toggleSelectAll = () => {
    const allSelected = items.length > 0 && items.every((c) => selectedKeys[getItemKey(c)]);
    if (allSelected) {
      setSelectedKeys({});
    } else {
      const next: Record<string, boolean> = {};
      items.forEach((c) => {
        next[getItemKey(c)] = true;
      });
      setSelectedKeys(next);
    }
  };

  const handlePredictCategory = async (c: CandidateItem) => {
    const key = getItemKey(c);
    setPredictingKey(key);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/mercadolivre/categories/predict?q=${encodeURIComponent(c.name)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const top = (data.suggestions || [])[0];
        if (top) {
          setCategoryOverrides((prev) => ({
            ...prev,
            [key]: { id: top.category_id, name: top.category_name },
          }));
          toast.success(`Categoria sugerida: ${top.category_id} (${top.category_name})`);
        }
      }
    } catch {
      toast.error('Não foi possível consultar o preditor de categorias.');
    } finally {
      setPredictingKey(null);
    }
  };

  const handlePublishSelected = async () => {
    let selectedList = items.filter((c) => selectedKeys[getItemKey(c)]);
    // Se nenhum checkbox estiver marcado mas houver um item ativo na ficha, publica o item ativo
    if (selectedList.length === 0 && items[activeIndex]) {
      selectedList = [items[activeIndex]];
    }
    if (selectedList.length === 0) {
      toast.warning('Selecione ao menos 1 produto na planilha para publicar no Mercado Livre.');
      return;
    }

    setPublishing(true);
    try {
      const token = getToken();
      const payloadItems = selectedList.map((c) => {
        const key = getItemKey(c);
        const cat = categoryOverrides[key] || {
          id: c.suggested_category_id,
          name: c.suggested_category_name,
        };
        const finalPrice =
          priceOverrides[key] !== undefined ? priceOverrides[key] : c.calculated_meli_price;

        return {
          product_id: c.product_id,
          horus_cod_item: c.horus_cod_item,
          sku: c.sku,
          ean_gtin: c.ean_gtin,
          title: c.name,
          description: c.description || c.name,
          base_price: c.base_price,
          meli_price: finalPrice,
          stock_quantity: c.raw_stock,
          category_id: cat.id,
          category_name: cat.name,
          cover_url: c.cover_url,
          author: c.author,
          publisher: c.publisher,
          brand: c.brand,
          attributes: c.auto_attributes,
        };
      });

      const res = await fetch(`${API_URL}/mercadolivre/listings/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: payloadItems }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Não foi possível concluir a publicação.');
        return;
      }

      toast.success(data.message || 'Anúncios publicados com sucesso!');
      setSelectedKeys({});
      fetchCandidates();
    } catch {
      toast.error('Falha de comunicação ao publicar anúncios.');
    } finally {
      setPublishing(false);
    }
  };

  const selectedCount = items.filter((c) => selectedKeys[getItemKey(c)]).length;
  const activeCandidate = items[activeIndex] || null;
  const activeKey = activeCandidate ? getItemKey(activeCandidate) : '';
  const activeCat =
    activeCandidate &&
    (categoryOverrides[activeKey] || {
      id: activeCandidate.suggested_category_id,
      name: activeCandidate.suggested_category_name,
    });
  const activePrice =
    activeCandidate &&
    (priceOverrides[activeKey] !== undefined
      ? priceOverrides[activeKey]
      : activeCandidate.calculated_meli_price);

  return (
    <div className="space-y-4 pb-8">
      {/* Cabeçalho Unificado com Stepper de 4 Etapas e Botão Primário Único */}
      <MeliStepHeader
        currentStep={2}
        title="Publicador 1-Clique do Catálogo Local & Acervo Horus ERP"
        explanation="Navegue pela planilha com as setas ↑↓, confira a Ficha Técnica Automática no painel à direita e publique em lote."
        guideSteps={[
          'Escolha a origem (Catálogo Local ou Horus ERP)',
          'Marque os itens desejados (ou pressione Espaço)',
          'Clique em Publicar no Mercado Livre (ou F2)',
        ]}
        actions={
          <button
            type="button"
            onClick={handlePublishSelected}
            disabled={publishing || items.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {selectedCount > 0
              ? `Publicar Selecionados (${selectedCount}) [F2]`
              : 'Publicar Registro Atual [F2]'}
          </button>
        }
      />

      {/* Barra de Filtro & Fonte de Dados (Enxuta e Sem Botões Duplicados) */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchCandidates()}
            placeholder="Filtrar por ISBN/GTIN, SKU ou Título e pressionar Enter..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setSourceMode('LOCAL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                sourceMode === 'LOCAL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              Catálogo Local
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('HORUS')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer inline-flex items-center gap-1 ${
                sourceMode === 'HORUS'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              Acervo Horus ERP
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyUnlisted}
              onChange={(e) => setOnlyUnlisted(e.target.checked)}
              className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
            />
            Ocultar já publicados
          </label>
        </div>
      </div>

      {/* Layout Mestre-Detalhe Estilo Access Moderno (Planilha à Esquerda + Ficha Automática à Direita) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Coluna Esquerda (8 cols): Grade de Alta Densidade (Spreadsheet View) */}
        <div className="xl:col-span-8 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-50/80 dark:bg-slate-900/60">
                <th className="py-3 px-3.5 w-9">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && items.every((c) => selectedKeys[getItemKey(c)])}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">ISBN / SKU</th>
                <th className="py-3 px-3">Obra / Produto</th>
                <th className="py-3 px-3">Cat. ML</th>
                <th className="py-3 px-3 text-right">Capa → Preço ML</th>
                <th className="py-3 px-3.5 text-center">Estoque → ML</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Carregando planilha de produtos candidatos...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Package className="h-7 w-7 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">Nenhum produto candidato para exibir.</p>
                  </td>
                </tr>
              ) : (
                items.map((c, idx) => {
                  const key = getItemKey(c);
                  const isChecked = !!selectedKeys[key];
                  const isFocused = idx === activeIndex;
                  const cat = categoryOverrides[key] || {
                    id: c.suggested_category_id,
                    name: c.suggested_category_name,
                  };
                  const currentPrice =
                    priceOverrides[key] !== undefined
                      ? priceOverrides[key]
                      : c.calculated_meli_price;

                  return (
                    <tr
                      key={key}
                      onClick={() => setActiveIndex(idx)}
                      className={`cursor-pointer transition ${
                        isFocused
                          ? 'bg-amber-50/90 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-400/60'
                          : isChecked
                          ? 'bg-slate-50 dark:bg-slate-800/40'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelectedKeys((prev) => ({ ...prev, [key]: e.target.checked }))
                          }
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {c.ean_gtin || c.sku || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">SKU: {c.sku}</div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white truncate max-w-[260px]">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[260px]">
                          {c.author} • {c.publisher}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                          {cat.id}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className="text-slate-400 text-[11px]">
                          R$ {(c.base_price || 0).toFixed(2).replace('.', ',')} →{' '}
                        </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          R$ {(currentPrice || 0).toFixed(2).replace('.', ',')}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-center font-mono">
                        <span className="text-slate-400">{c.raw_stock}</span>
                        <span className="mx-1 text-slate-300">→</span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            c.effective_meli_stock > 0
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {c.effective_meli_stock} un.
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Coluna Direita (4 cols): Ficha de Inspeção & Ajuste Rápido do Registro Selecionado */}
        <div className="xl:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 sticky top-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                Ficha do Anúncio Selecionado
              </h3>
            </div>
            {activeCandidate && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                #{activeIndex + 1} de {items.length}
              </span>
            )}
          </div>

          {!activeCandidate ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Selecione uma linha na planilha ao lado para inspecionar ou ajustar a ficha do anúncio.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cabeçalho do Produto na Ficha */}
              <div className="flex items-start gap-3">
                <div className="h-16 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                  {activeCandidate.cover_url ? (
                    <img
                      src={activeCandidate.cover_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                    {activeCandidate.name}
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    ISBN/EAN: <strong>{activeCandidate.ean_gtin || 'Não informado'}</strong>
                  </p>
                  {activeCandidate.existing_listing && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      <CheckCircle2 className="h-3 w-3" /> Já publicado ({activeCandidate.existing_listing.meli_item_id})
                    </span>
                  )}
                </div>
              </div>

              {/* Ajuste de Preço com CurrencyInput e Categoria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Preço no Mercado Livre
                  </label>
                  <CurrencyInput
                    value={activePrice || 0}
                    onChangeValue={(val) =>
                      setPriceOverrides((prev) => ({ ...prev, [activeKey]: val }))
                    }
                    prefixStr="R$ "
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold"
                  />
                  <span className="block text-[10px] text-slate-400 mt-0.5 font-mono">
                    Preço Capa: R$ {(activeCandidate.base_price || 0).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-500">Categoria MLB</label>
                    <button
                      type="button"
                      onClick={() => handlePredictCategory(activeCandidate)}
                      disabled={predictingKey === activeKey}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      title="Consultar Preditor Oficial do Mercado Livre pelo título"
                    >
                      {predictingKey === activeKey ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Auto-Predizer
                    </button>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-indigo-600">
                    {activeCat?.id}
                  </div>
                  <span className="block text-[10px] text-slate-400 mt-0.5 truncate">
                    {activeCat?.name}
                  </span>
                </div>
              </div>

              {/* Atributos da Ficha Técnica Automática */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-amber-500" /> Atributos Enviados Automaticamente:
                  </span>
                  <span className="text-emerald-600">{activeCandidate.auto_attributes.length} campos prontos</span>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-52 overflow-y-auto">
                  {activeCandidate.auto_attributes.map((attr) => (
                    <div
                      key={attr.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 bg-slate-50/40 dark:bg-slate-900"
                    >
                      <span className="font-mono text-[11px] font-bold text-slate-500">
                        {attr.id}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-right truncate max-w-[180px]">
                        {attr.value_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra Inferior de Navegação Estilo Access Moderno */}
      <MeliAccessFooter
        currentIndex={activeIndex}
        totalCount={items.length}
        onSelectIndex={setActiveIndex}
        extraHints={[
          '↑↓ Navegar planilha',
          'Espaço Marcar/Desmarcar item',
          'F2 Publicar no Mercado Livre',
        ]}
      />
    </div>
  );
}
