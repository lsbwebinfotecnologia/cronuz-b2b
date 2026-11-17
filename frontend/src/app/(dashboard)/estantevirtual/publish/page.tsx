'use client';

import { useState, useEffect } from 'react';
import {
  Zap,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BookOpen,
  RefreshCw,
  CheckSquare,
  Square,
  Send,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { EvStepHeader, EvAccessFooter } from '@/components/estantevirtual/EvStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EvCandidate {
  source: string;
  product_id: number | null;
  horus_cod_item: number | null;
  sku: string;
  isbn: string;
  isbn_valid: boolean;
  title: string;
  author: string;
  publisher: string;
  subject: string;
  ev_category_id: number;
  ev_category_name: string;
  condition: string;
  base_price: number;
  ev_price: number;
  raw_stock: number;
  effective_stock: number;
  weight_grams: number;
  release_year: number;
  language: string;
  handling_days: number;
  thumbnail: string | null;
  description: string;
  already_published: boolean;
  ev_listing_id: number | null;
  ev_status: string | null;
  queue_operation: string | null;
}

export default function EstanteVirtualPublishPage() {
  const [candidates, setCandidates] = useState<EvCandidate[]>([]);
  const [evCategories, setEvCategories] = useState<{ id: number; name: string }[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [selectedSkus, setSelectedSkus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [search, setSearch] = useState('');

  // Ficha lateral editável antes de enviar à fila
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editPublisher, setEditPublisher] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<number>(65);
  const [editCondition, setEditCondition] = useState<'NOVO' | 'USADO'>('NOVO');
  const [editBasePrice, setEditBasePrice] = useState<number>(0);
  const [editEvPrice, setEditEvPrice] = useState<number>(6);
  const [editStock, setEditStock] = useState<number>(0);
  const [editWeight, setEditWeight] = useState<number>(300);
  const [editHandlingDays, setEditHandlingDays] = useState<number>(2);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '60');

      const [resCand, resCats] = await Promise.all([
        fetch(`${API_URL}/estantevirtual/catalog-candidates?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/estantevirtual/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resCand.ok) {
        const data = await resCand.json();
        const rows: EvCandidate[] = data.items || [];
        setCandidates(rows);
        setActiveIndex((prev) => (rows.length > 0 ? Math.min(prev, rows.length - 1) : 0));
      }
      if (resCats.ok) {
        const catData = await resCats.json();
        setEvCategories(catData.items || []);
      }
    } catch {
      toast.error('Erro ao buscar produtos do Catálogo / Horus ERP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const activeItem = candidates[activeIndex] || null;

  useEffect(() => {
    if (activeItem) {
      setEditTitle(activeItem.title || '');
      setEditAuthor(activeItem.author || 'Vários Autores');
      setEditPublisher(activeItem.publisher || 'Editora');
      setEditCategoryId(activeItem.ev_category_id || 65);
      setEditCondition(activeItem.condition === 'USADO' ? 'USADO' : 'NOVO');
      setEditBasePrice(activeItem.base_price || 6);
      setEditEvPrice(Math.max(6, activeItem.ev_price || 6));
      setEditStock(activeItem.effective_stock || 0);
      setEditWeight(activeItem.weight_grams || 300);
      setEditHandlingDays(activeItem.handling_days || 2);
    }
  }, [activeIndex, activeItem?.sku]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F2') {
        e.preventDefault();
        if (activeItem) handlePublishSingleActive();
        return;
      }
      if (inInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((p) => Math.min(Math.max(0, candidates.length - 1), p + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((p) => Math.max(0, p - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(0, candidates.length - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        if (activeItem && activeItem.isbn_valid) {
          toggleSku(activeItem.sku);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const toggleSku = (sku: string) => {
    setSelectedSkus((prev) => ({ ...prev, [sku]: !prev[sku] }));
  };

  const toggleSelectAllValid = () => {
    const validItems = candidates.filter((c) => c.isbn_valid);
    const allChecked = validItems.length > 0 && validItems.every((c) => selectedSkus[c.sku]);
    if (allChecked) {
      setSelectedSkus({});
    } else {
      const next: Record<string, boolean> = {};
      validItems.forEach((c) => {
        next[c.sku] = true;
      });
      setSelectedSkus(next);
    }
  };

  const handlePublishSingleActive = async () => {
    if (!activeItem) return;
    if (!activeItem.isbn_valid) {
      toast.error('Este item não possui um ISBN válido de 10 ou 13 dígitos exigido pela Estante Virtual.');
      return;
    }
    setPublishing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/listings/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          process_immediately: true,
          items: [
            {
              product_id: activeItem.product_id,
              sku: activeItem.sku,
              isbn: activeItem.isbn,
              horus_cod_item: activeItem.horus_cod_item,
              title: editTitle.slice(0, 130),
              author: editAuthor,
              publisher: editPublisher,
              subject: activeItem.subject,
              ev_category_id: editCategoryId,
              condition: editCondition,
              base_price: editBasePrice,
              ev_price: Math.max(6, editEvPrice),
              stock: editStock,
              weight_grams: editWeight,
              release_year: activeItem.release_year,
              language: activeItem.language,
              handling_days: editHandlingDays,
              thumbnail: activeItem.thumbnail,
              description: activeItem.description,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Livro enviado para a Fila da Estante Virtual!');
        fetchCandidates();
      } else {
        toast.error(data.detail || 'Falha ao enfileirar livro.');
      }
    } catch {
      toast.error('Erro de comunicação ao publicar livro.');
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishSelectedBatch = async () => {
    const selectedList = candidates.filter((c) => selectedSkus[c.sku] && c.isbn_valid);
    if (selectedList.length === 0) {
      toast.error('Selecione ao menos 1 livro com ISBN válido na planilha.');
      return;
    }
    setPublishing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/listings/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          process_immediately: true,
          items: selectedList.map((c) => ({
            product_id: c.product_id,
            sku: c.sku,
            isbn: c.isbn,
            horus_cod_item: c.horus_cod_item,
            title: c.title.slice(0, 130),
            author: c.author,
            publisher: c.publisher,
            subject: c.subject,
            ev_category_id: c.ev_category_id,
            condition: c.condition,
            base_price: c.base_price,
            ev_price: Math.max(6, c.ev_price),
            stock: c.effective_stock,
            weight_grams: c.weight_grams,
            release_year: c.release_year,
            language: c.language,
            handling_days: c.handling_days,
            thumbnail: c.thumbnail,
            description: c.description,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || `${selectedList.length} livros enfileirados e processados!`);
        setSelectedSkus({});
        fetchCandidates();
      } else {
        toast.error(data.detail || 'Erro ao enfileirar lote de livros.');
      }
    } catch {
      toast.error('Falha de rede ao enviar lote para a fila.');
    } finally {
      setPublishing(false);
    }
  };

  const selectedCount = Object.values(selectedSkus).filter(Boolean).length;

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <EvStepHeader
        currentStep={2}
        title="Publicar Acervo do Catálogo / Horus ERP para a Fila Estante Virtual"
        explanation="Selecione os livros da grade para enviá-los à Fila Assíncrona (mkt_sync_queue). O sistema sanitiza HTML/emojis, valida ISBN e drena automaticamente para POST /produtos."
        guideSteps={[
          'Pesquise por ISBN, Título ou Autor no Catálogo / Horus ERP',
          'Marque múltiplos livros na grade (ou revise a Ficha Técnica à direita)',
          'Clique em "Ativar & Enviar para Fila EV" (ou pressione F2 para o livro ativo)',
        ]}
        actions={
          <button
            type="button"
            onClick={selectedCount > 0 ? handlePublishSelectedBatch : handlePublishSingleActive}
            disabled={publishing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {selectedCount > 0
              ? `Ativar & Enviar ${selectedCount} Livro(s) para Fila EV`
              : 'Ativar Livro Selecionado (F2)'}
          </button>
        }
      />

      {/* Barra de Busca e Seleção em Lote */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCandidates()}
              placeholder="Buscar no Horus ERP / Catálogo por ISBN, Código ou Título..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={fetchCandidates}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Consultar
          </button>
        </div>

        <button
          type="button"
          onClick={toggleSelectAllValid}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 cursor-pointer"
        >
          <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
          Selecionar / Desmarcar Todos com ISBN Válido
        </button>
      </div>

      {/* Layout Mestre-Detalhe Estilo Access Moderno: Planilha à Esquerda (8 cols) + Ficha Técnica à Direita (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold uppercase text-slate-500">
                  <th className="py-2.5 px-3 w-9 text-center">Sel</th>
                  <th className="py-2.5 px-3">ISBN / Código</th>
                  <th className="py-2.5 px-3">Título (Máx 130) &amp; Autor</th>
                  <th className="py-2.5 px-3">Estante EV (1..74)</th>
                  <th className="py-2.5 px-3 text-right">valor_de / valor_por</th>
                  <th className="py-2.5 px-3 text-right">Saldo</th>
                  <th className="py-2.5 px-3 text-center">Status EV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Carregando acervo do Horus ERP / Catálogo...
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Nenhum livro encontrado para os filtros informados.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c, idx) => {
                    const isSelectedRow = idx === activeIndex;
                    const checked = Boolean(selectedSkus[c.sku]);
                    return (
                      <tr
                        key={`${c.sku}-${idx}`}
                        onClick={() => setActiveIndex(idx)}
                        className={`cursor-pointer transition ${
                          isSelectedRow
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/40 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td
                          className="py-2.5 px-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (c.isbn_valid) toggleSku(c.sku);
                          }}
                        >
                          {c.isbn_valid ? (
                            checked ? (
                              <CheckSquare className="h-4 w-4 text-indigo-600 mx-auto" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-300 mx-auto" />
                            )
                          ) : (
                            <span title="ISBN obrigatório (10 ou 13 dígitos)">
                              <AlertTriangle className="h-4 w-4 text-rose-500 mx-auto" />
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {c.isbn || 'SEM ISBN'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            SKU: {c.sku} • {c.source}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 max-w-[260px]">
                          <div className="truncate font-bold text-slate-900 dark:text-white">
                            {c.title}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {c.author} • {c.publisher}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold">
                            #{c.ev_category_id} {c.ev_category_name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="text-[10px] text-slate-400 line-through">
                            R$ {Number(c.base_price || 0).toFixed(2).replace('.', ',')}
                          </div>
                          <div className="font-extrabold text-emerald-700 dark:text-emerald-400">
                            R$ {Number(c.ev_price || 0).toFixed(2).replace('.', ',')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {c.effective_stock}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {c.queue_operation ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-extrabold">
                              NA FILA ({c.queue_operation})
                            </span>
                          ) : c.already_published ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold">
                              <CheckCircle2 className="h-3 w-3" /> PUBLICADO
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold">
                              DISPONÍVEL
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
        </div>

        {/* Ficha Lateral de Conferência / Edição Rápida Estilo Access */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                Ficha de Publicação Estante Virtual
              </h3>
            </div>
            {activeItem && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                ISBN {activeItem.isbn || 'N/A'}
              </span>
            )}
          </div>

          {!activeItem ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              Selecione um livro na planilha ao lado para revisar os metadados da Estante Virtual.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Título na Capa ({editTitle.length}/130 chars máx)
                </label>
                <input
                  type="text"
                  maxLength={130}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Autor(es)
                  </label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Editora (<code className="font-mono">marca</code>)
                  </label>
                  <input
                    type="text"
                    value={editPublisher}
                    onChange={(e) => setEditPublisher(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Estante EV (<code className="font-mono">categoria_id</code>)
                  </label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                  >
                    {evCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Condição (<code className="font-mono">tipo</code>)
                  </label>
                  <select
                    value={editCondition}
                    disabled={activeItem.already_published}
                    onChange={(e) => setEditCondition(e.target.value as 'NOVO' | 'USADO')}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold disabled:opacity-60"
                  >
                    <option value="NOVO">NOVO</option>
                    <option value="USADO">USADO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Preço Antigo (<code className="font-mono">valor_de</code>)
                  </label>
                  <CurrencyInput
                    value={editBasePrice}
                    onChangeValue={(val) => setEditBasePrice(val)}
                    prefixStr="R$ "
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Preço EV (<code className="font-mono">valor_por</code> ≥ R$ 6)
                  </label>
                  <CurrencyInput
                    value={editEvPrice}
                    onChangeValue={(val) => setEditEvPrice(Math.max(6, val))}
                    prefixStr="R$ "
                    className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/30 font-mono text-xs font-extrabold text-indigo-700 dark:text-indigo-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Estoque EV
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editStock}
                    onChange={(e) => setEditStock(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Peso (g)
                  </label>
                  <input
                    type="number"
                    min={50}
                    value={editWeight}
                    onChange={(e) => setEditWeight(Math.max(50, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Postagem (d)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={editHandlingDays}
                    onChange={(e) => setEditHandlingDays(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ao confirmar, o livro entra na fila <code className="font-mono">mkt_sync_queue</code>, é enviado à Estante Virtual e removido automaticamente da fila após confirmação.
              </p>
            </div>
          )}
        </div>
      </div>

      <EvAccessFooter
        currentIndex={activeIndex}
        totalCount={candidates.length}
        onSelectIndex={setActiveIndex}
        extraHints={[
          '↑↓ Navegar livros',
          'Espaço Marcar/Desmarcar para Lote',
          'F2 Enviar Livro Ativo para Fila',
        ]}
      />
    </div>
  );
}
