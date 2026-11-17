'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  Trash2,
  Save,
  History,
  Loader2,
  Layers,
  Play,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { EvStepHeader, EvAccessFooter } from '@/components/estantevirtual/EvStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EvListingItem {
  id: number;
  product_id: number | null;
  sku: string;
  isbn: string;
  horus_cod_item: number | null;
  title: string;
  author: string;
  publisher: string;
  ev_category_id: number;
  ev_category_name: string;
  condition: string;
  status: string;
  is_published_on_ev: boolean;
  base_price: number;
  ev_price: number;
  current_stock: number;
  last_synced_stock: number | null;
  last_synced_price: number | null;
  handling_days: number;
  weight_grams: number;
  release_year: number;
  language: string;
  thumbnail: string | null;
  sync_error: string | null;
  last_synced_at: string | null;
}

interface QueueTaskItem {
  id: number;
  sku: string;
  isbn_ean: string | null;
  title: string | null;
  operation: string;
  priority: number;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string | null;
}

interface EvSyncLogItem {
  id: number;
  sync_type: string;
  status: string;
  items_processed: number;
  items_updated: number;
  items_failed: number;
  message: string;
  created_at: string;
}

export default function EstanteVirtualDashboardPage() {
  const [listings, setListings] = useState<EvListingItem[]>([]);
  const [queueItems, setQueueItems] = useState<QueueTaskItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [kpis, setKpis] = useState({ total: 0, active: 0, paused: 0, zero_stock: 0, error: 0 });
  const [logs, setLogs] = useState<EvSyncLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingDelta, setSyncingDelta] = useState(false);
  const [drainingQueue, setDrainingQueue] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Campos de controle rápido da Ficha Lateral (Access Moderno)
  const [editBasePrice, setEditBasePrice] = useState<number>(6);
  const [editEvPrice, setEditEvPrice] = useState<number>(6);
  const [editStock, setEditStock] = useState<number>(0);
  const [editHandlingDays, setEditHandlingDays] = useState<number>(2);
  const [editStatus, setEditStatus] = useState<string>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const [resList, resLogs] = await Promise.all([
        fetch(`${API_URL}/estantevirtual/listings?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/estantevirtual/logs?limit=8`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resList.ok) {
        const data = await resList.json();
        const rows: EvListingItem[] = data.items || [];
        setListings(rows);
        setQueueItems(data.queue_items || []);
        setActiveIndex((prev) => (rows.length > 0 ? Math.min(prev, rows.length - 1) : 0));
        if (data.kpis) setKpis(data.kpis);
      }
      if (resLogs.ok) {
        const logData = await resLogs.json();
        setLogs(logData.items || []);
      }
    } catch {
      toast.error('Não foi possível carregar o acervo da Estante Virtual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [statusFilter]);

  const activeItem = listings[activeIndex] || null;

  useEffect(() => {
    if (activeItem) {
      setEditBasePrice(activeItem.base_price || 6);
      setEditEvPrice(Math.max(6, activeItem.ev_price || 6));
      setEditStock(activeItem.current_stock || 0);
      setEditHandlingDays(activeItem.handling_days || 2);
      setEditStatus(activeItem.status || 'active');
    }
  }, [activeIndex, activeItem?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F2') {
        e.preventDefault();
        if (activeItem) handleSaveQuickEdit();
        return;
      }
      if (inInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((p) => Math.min(Math.max(0, listings.length - 1), p + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((p) => Math.max(0, p - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(0, listings.length - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSaveQuickEdit = async () => {
    if (!activeItem) return;
    if (editEvPrice < 6) {
      toast.error('O preço na Estante Virtual não pode ser inferior a R$ 6,00.');
      return;
    }
    setSavingEdit(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/listings/${activeItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          base_price: Math.max(editEvPrice, editBasePrice),
          ev_price: editEvPrice,
          current_stock: editStock,
          handling_days: editHandlingDays,
          status: editStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Anúncio atualizado e sincronizado!');
        fetchListings();
      } else {
        toast.error(data.detail || 'Não foi possível salvar a alteração.');
      }
    } catch {
      toast.error('Falha de rede ao salvar edição rápida.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDrainQueue = async () => {
    setDrainingQueue(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/queue/process?max_items=100`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Fila processada com sucesso!');
        fetchListings();
      } else {
        toast.error(data.detail || 'Não foi possível processar a fila agora.');
      }
    } catch {
      toast.error('Erro de conexão ao processar a fila.');
    } finally {
      setDrainingQueue(false);
    }
  };

  const handleTriggerDeltaSync = async () => {
    setSyncingDelta(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/sync/stock?force_all=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Delta Sync concluído!');
        fetchListings();
      } else {
        toast.error(data.detail || 'Falha ao executar sincronização Delta.');
      }
    } catch {
      toast.error('Erro ao acionar Delta Sync.');
    } finally {
      setSyncingDelta(false);
    }
  };

  const handleDeleteListing = async (id: number) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Livro zerado e removido.');
        fetchListings();
      } else {
        toast.error(data.detail || 'Não foi possível remover o anúncio.');
      }
    } catch {
      toast.error('Erro de rede ao remover anúncio.');
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <EvStepHeader
        currentStep={3}
        title="Planilha de Controle de Anúncios, Fila Assíncrona & Lote Estoque/Preços"
        explanation="Gerencie o estado vivo dos livros publicados na Estante Virtual, acompanhe a drenagem automática da fila (mkt_sync_queue) e dispare lotes PUT /estoques e PUT /precos."
        guideSteps={[
          'Use as setas ↑↓ para navegar pelos livros na planilha de alta densidade',
          'Ajuste valor_de, valor_por ou Estoque na Ficha Lateral e pressione F2',
          'Itens concluídos na Fila mkt_sync_queue são eliminados automaticamente após sincronizar',
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {queueItems.length > 0 && (
              <button
                type="button"
                onClick={handleDrainQueue}
                disabled={drainingQueue}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {drainingQueue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Processar Fila Agora ({queueItems.length})
              </button>
            )}
            <button
              type="button"
              onClick={handleTriggerDeltaSync}
              disabled={syncingDelta}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {syncingDelta ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar Lote Horus → EV
            </button>
          </div>
        }
      />

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total no Acervo EV', val: kpis.total, filter: 'ALL', color: 'text-slate-900 dark:text-white' },
          { label: 'Ativos c/ Saldo', val: kpis.active, filter: 'active', color: 'text-emerald-600' },
          { label: 'Em Fila / Pausados', val: kpis.paused, filter: 'queued', color: 'text-amber-600' },
          { label: 'Estoque Zerado (0)', val: kpis.zero_stock, filter: 'zero_stock', color: 'text-slate-500' },
          { label: 'Pendentes na Fila', val: queueItems.length, filter: 'ALL', color: 'text-indigo-600' },
        ].map((k, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setStatusFilter(k.filter)}
            className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-left hover:border-indigo-400 transition cursor-pointer"
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase">{k.label}</p>
            <p className={`text-xl font-black font-mono mt-0.5 ${k.color}`}>{k.val}</p>
          </button>
        ))}
      </div>

      {/* Painel Visível da Fila de Processamento (mkt_sync_queue) quando houver tarefas pendentes */}
      {queueItems.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/25 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-600" />
              <h3 className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-200">
                Fila de Processamento Assíncrona (<code className="font-mono">mkt_sync_queue</code>) • {queueItems.length} tarefa(s) aguardando envio
              </h3>
            </div>
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Itens sincronizados com sucesso são eliminados automaticamente desta fila
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {queueItems.slice(0, 12).map((q) => (
              <div
                key={q.id}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-[11px] flex items-center gap-2"
              >
                <span className="font-mono font-bold text-indigo-600">{q.operation}</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{q.sku}</span>
                <span className="text-slate-400 truncate max-w-[140px]">{q.title}</span>
                {q.error_message && (
                  <span className="text-rose-600 font-semibold" title={q.error_message}>
                    (Tentativa {q.attempts}/3)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Filtro */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchListings()}
            placeholder="Filtrar por ISBN, Código SKU, Título ou Autor..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {['ALL', 'active', 'queued', 'zero_stock', 'error'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st === 'ALL'
                ? 'Todos'
                : st === 'active'
                ? 'Ativos'
                : st === 'queued'
                ? 'Na Fila'
                : st === 'zero_stock'
                ? 'Sem Saldo'
                : 'Com Erro'}
            </button>
          ))}
        </div>
      </div>

      {/* Grade Principal + Ficha Lateral Access Moderno */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold uppercase text-slate-500">
                  <th className="py-2.5 px-3">Código / ISBN</th>
                  <th className="py-2.5 px-3">Título &amp; Editora</th>
                  <th className="py-2.5 px-3">Estante / Tipo</th>
                  <th className="py-2.5 px-3 text-right">valor_de / valor_por</th>
                  <th className="py-2.5 px-3 text-right">Estoque EV</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Carregando anúncios da Estante Virtual...
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Nenhum livro integrado ainda. Acesse a Etapa 2 (Alt+2) para ativar livros do Catálogo / Horus.
                    </td>
                  </tr>
                ) : (
                  listings.map((item, idx) => {
                    const isSelected = idx === activeIndex;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setActiveIndex(idx)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/40 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{item.isbn}</div>
                          <div className="text-[10px] text-slate-400">SKU: {item.sku}</div>
                        </td>
                        <td className="py-2.5 px-3 max-w-[260px]">
                          <div className="truncate font-bold text-slate-900 dark:text-white">{item.title}</div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {item.author} • {item.publisher}
                          </div>
                          {item.sync_error && (
                            <div className="text-[10px] text-rose-600 truncate mt-0.5">{item.sync_error}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold">
                            #{item.ev_category_id} {item.ev_category_name}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Tipo: {item.condition} • {item.handling_days}d
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="text-[10px] text-slate-400 line-through">
                            R$ {Number(item.base_price || 0).toFixed(2).replace('.', ',')}
                          </div>
                          <div className="font-extrabold text-emerald-700 dark:text-emerald-400">
                            R$ {Number(item.ev_price || 0).toFixed(2).replace('.', ',')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {item.current_stock}
                          </span>
                          {item.last_synced_stock !== null && (
                            <div className="text-[10px] text-slate-400">Sync: {item.last_synced_stock}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.status === 'active' && item.current_stock > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold">
                              <CheckCircle2 className="h-3 w-3" /> ATIVO
                            </span>
                          ) : item.status === 'queued' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-extrabold">
                              NA FILA
                            </span>
                          ) : item.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-extrabold">
                              <AlertTriangle className="h-3 w-3" /> ERRO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 text-[10px] font-bold">
                              <PauseCircle className="h-3 w-3" /> PAUSADO / 0
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

        {/* Ficha Lateral de Edição Rápida (PUT /precos e PUT /estoques via Fila) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                Ficha Rápida • Preço &amp; Estoque EV
              </h3>
              {activeItem && (
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 font-bold">
                  Tipo Travado: {activeItem.condition}
                </span>
              )}
            </div>

            {!activeItem ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Selecione um anúncio na planilha para editar preço e estoque.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <p className="font-extrabold text-slate-900 dark:text-white line-clamp-2">
                    {activeItem.title}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    ISBN: {activeItem.isbn} • Código: {activeItem.sku}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Preço De (<code className="font-mono">valor_de</code>)
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
                      Preço Por (<code className="font-mono">valor_por</code>)
                    </label>
                    <CurrencyInput
                      value={editEvPrice}
                      onChangeValue={(val) => setEditEvPrice(Math.max(6, val))}
                      prefixStr="R$ "
                      className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/30 font-mono text-xs font-extrabold text-indigo-700 dark:text-indigo-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Estoque (<code className="font-mono">PUT /estoques</code>)
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
                      Prazo Postagem (1..20d)
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

                <div className="flex items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteListing(activeItem.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 text-xs font-bold cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Zerar &amp; Excluir
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveQuickEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar &amp; Enfileirar (F2)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Histórico Recente de Sincronizações */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200">
              <History className="h-4 w-4 text-indigo-600" />
              Histórico de Execuções da Fila EV
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-[11px] text-slate-400">Nenhuma execução registrada ainda.</p>
              ) : (
                logs.map((l) => (
                  <div
                    key={l.id}
                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-[11px] flex items-start justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-indigo-600 mr-1.5">{l.sync_type}</span>
                      <span className="text-slate-600 dark:text-slate-300">{l.message}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {l.items_updated}/{l.items_processed}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <EvAccessFooter
        currentIndex={activeIndex}
        totalCount={listings.length}
        onSelectIndex={setActiveIndex}
      />
    </div>
  );
}
