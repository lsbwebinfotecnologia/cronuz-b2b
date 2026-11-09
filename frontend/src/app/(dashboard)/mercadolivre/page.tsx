'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingBag,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  Download,
  Package,
  Trash2,
  Save,
  History,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { MeliStepHeader, MeliAccessFooter } from '@/components/mercadolivre/MeliStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface MeliListingItem {
  id: number;
  product_id: number | null;
  sku: string | null;
  ean_gtin: string | null;
  horus_cod_item: number | null;
  title: string;
  meli_item_id: string;
  meli_category_id: string;
  meli_category_name: string | null;
  listing_type_id: string;
  status: string;
  base_price: number;
  meli_price: number;
  current_stock: number;
  last_synced_stock: number | null;
  logistic_type: string | null;
  permalink: string | null;
  thumbnail: string | null;
  sync_error: string | null;
  last_synced_at: string | null;
}

interface MeliSyncLogItem {
  id: number;
  sync_type: string;
  status: string;
  items_processed: number;
  items_updated: number;
  items_failed: number;
  message: string;
  created_at: string;
}

export default function MercadoLivreDashboardPage() {
  const [listings, setListings] = useState<MeliListingItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [kpis, setKpis] = useState({ total: 0, active: 0, paused: 0, zero_stock: 0 });
  const [logs, setLogs] = useState<MeliSyncLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingStock, setSyncingStock] = useState(false);
  const [importingMeli, setImportingMeli] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Campos de controle rápido da Ficha Lateral (Access Moderno)
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
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
        fetch(`${API_URL}/mercadolivre/listings?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/mercadolivre/logs?limit=8`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resList.ok) {
        const data = await resList.json();
        const rows: MeliListingItem[] = data.items || [];
        setListings(rows);
        setActiveIndex((prev) => (rows.length > 0 ? Math.min(prev, rows.length - 1) : 0));
        if (data.kpis) setKpis(data.kpis);
      }
      if (resLogs.ok) {
        const logData = await resLogs.json();
        setLogs(logData.items || []);
      }
    } catch {
      toast.error('Não foi possível carregar os anúncios do Mercado Livre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [statusFilter]);

  const activeItem = listings[activeIndex] || null;

  // Sincroniza o formulário lateral quando o registro selecionado muda
  useEffect(() => {
    if (activeItem) {
      setEditPrice(activeItem.meli_price || 0);
      setEditStock(activeItem.current_stock || 0);
      setEditStatus(activeItem.status === 'paused' ? 'paused' : 'active');
    }
  }, [activeItem?.id, activeItem?.meli_price, activeItem?.current_stock, activeItem?.status]);

  // Navegação por teclado estilo Planilha Excel / Access Moderno
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        if (e.key === 'F2') {
          e.preventDefault();
          handleSaveListingEdit();
        }
        return;
      }
      if (listings.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(listings.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(listings.length - 1);
      } else if (e.key === 'F2') {
        e.preventDefault();
        handleSaveListingEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listings, activeIndex, editPrice, editStock, editStatus]);

  const handleDeltaStockSync = async () => {
    setSyncingStock(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/sync/stock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Não foi possível sincronizar o estoque neste momento.');
        return;
      }
      toast.success(data.message || 'Sincronização Delta concluída com sucesso!');
      fetchListings();
    } catch {
      toast.error('Falha de comunicação ao sincronizar estoque.');
    } finally {
      setSyncingStock(false);
    }
  };

  const handleImportFromMeli = async () => {
    setImportingMeli(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/listings/import-from-meli`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.detail || 'Verifique se a conta do Mercado Livre está conectada na Etapa 1 (Pré-Configurações).'
        );
        return;
      }
      toast.success(data.message || 'Anúncios importados e vinculados com sucesso!');
      fetchListings();
    } catch {
      toast.error('Erro ao importar anúncios da conta Mercado Livre.');
    } finally {
      setImportingMeli(false);
    }
  };

  const handleSaveListingEdit = async () => {
    if (!activeItem) return;
    setSavingEdit(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/listings/${activeItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          meli_price: editPrice,
          current_stock: editStock,
          status: editStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Não foi possível salvar as alterações.');
        return;
      }
      toast.success(`Anúncio ${activeItem.meli_item_id} atualizado e sincronizado!`);
      fetchListings();
    } catch {
      toast.error('Erro ao salvar alterações do anúncio.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteListing = async (id: number) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Vínculo do anúncio removido do painel.');
        fetchListings();
      }
    } catch {
      toast.error('Erro ao desvincular anúncio.');
    }
  };

  const formatBRL = (val: number) =>
    (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4 pb-8">
      {/* Cabeçalho Unificado com Stepper de 4 Etapas e Ações Únicas de Sincronismo */}
      <MeliStepHeader
        currentStep={3}
        title="Mesa de Controle de Anúncios & Sincronização Delta de Estoque"
        explanation="Controle preços, status e saldos dos seus anúncios em formato Planilha + Ficha Lateral, sem precisar abrir tela por tela."
        guideSteps={[
          'Use Importar Anúncios do ML se já tiver publicações na conta',
          'Navegue com ↑↓ na planilha para editar Preço/Status na ficha lateral',
          'Clique em Sincronizar Estoque (Delta) para atualizar saldos do Horus/Cronuz',
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={handleImportFromMeli}
              disabled={importingMeli}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              {importingMeli ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Importar da Conta ML
            </button>

            <button
              type="button"
              onClick={handleDeltaStockSync}
              disabled={syncingStock}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncingStock ? 'animate-spin' : ''}`} />
              Sincronizar Estoque (Delta)
            </button>
          </>
        }
      />

      {/* Faixa Compacta de Indicadores + Busca e Filtros de Status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Total Vinculados</span>
            <p className="text-xl font-black text-slate-900 dark:text-white">{kpis.total}</p>
          </div>
          <ShoppingBag className="h-5 w-5 text-amber-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Ativos no ML</span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{kpis.active}</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Pausados</span>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400">{kpis.paused}</p>
          </div>
          <PauseCircle className="h-5 w-5 text-amber-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Zerados (Buffer)</span>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400">{kpis.zero_stock}</p>
          </div>
          <AlertTriangle className="h-5 w-5 text-rose-500" />
        </div>
      </div>

      {/* Filtro Rápido da Planilha */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchListings()}
            placeholder="Filtrar por código MLB, ISBN/GTIN, SKU ou Título e pressionar Enter..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['ALL', 'active', 'paused', 'under_review'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL'
                ? 'Todos'
                : st === 'active'
                ? 'Ativos'
                : st === 'paused'
                ? 'Pausados'
                : 'Pré-Vínculo'}
            </button>
          ))}
        </div>
      </div>

      {/* Layout Mestre-Detalhe Estilo Access Moderno (Planilha Limpa + Ficha de Controle Lateral) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Coluna Esquerda (8 cols): Planilha de Anúncios (Sem repetição de botões em cada linha!) */}
        <div className="xl:col-span-8 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-50/80 dark:bg-slate-900/60">
                <th className="py-3 px-3.5">Código MLB</th>
                <th className="py-3 px-3">ISBN / SKU</th>
                <th className="py-3 px-3">Título do Anúncio</th>
                <th className="py-3 px-3 text-right">Preço ML</th>
                <th className="py-3 px-3 text-center">Saldo ML</th>
                <th className="py-3 px-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Carregando planilha de anúncios...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Package className="h-7 w-7 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">Nenhum anúncio vinculado encontrado.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Vá na Etapa 2 (Publicar do Catálogo) ou clique em Importar da Conta ML no topo.
                    </p>
                  </td>
                </tr>
              ) : (
                listings.map((item, idx) => {
                  const isFocused = idx === activeIndex;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setActiveIndex(idx)}
                      className={`cursor-pointer transition ${
                        isFocused
                          ? 'bg-amber-50/90 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-400/60'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {item.meli_item_id}
                        </div>
                        <span className="text-[10px] text-slate-400">{item.meli_category_id}</span>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                        <div>{item.ean_gtin || '—'}</div>
                        <div className="text-[10px] text-slate-400">SKU: {item.sku || '—'}</div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white truncate max-w-[260px]">
                          {item.title}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.listing_type_id === 'gold_pro' ? 'Premium' : 'Clássico'}
                          {item.last_synced_at
                            ? ` • Sync: ${new Date(item.last_synced_at).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatBRL(item.meli_price)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Base: {formatBRL(item.base_price)}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            item.current_stock > 0
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {item.current_stock} un.
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            item.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : item.status === 'paused'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {item.status === 'active'
                            ? 'Ativo'
                            : item.status === 'paused'
                            ? 'Pausado'
                            : 'Pré-Vínculo'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Coluna Direita (4 cols): Ficha de Controle Rápido do Anúncio Selecionado */}
        <div className="xl:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 sticky top-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                Ficha de Controle do Anúncio
              </h3>
            </div>
            {activeItem && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                {activeItem.meli_item_id}
              </span>
            )}
          </div>

          {!activeItem ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Selecione qualquer anúncio na planilha ao lado (ou use as setas ↑↓) para controlar preço, estoque e status.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resumo Visual do Item */}
              <div className="flex items-start gap-3">
                <div className="h-16 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                  {activeItem.thumbnail ? (
                    <img src={activeItem.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                    {activeItem.title}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    ISBN: {activeItem.ean_gtin || '—'} | SKU: {activeItem.sku || '—'}
                  </p>
                  {activeItem.permalink && (
                    <a
                      href={activeItem.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:underline mt-1"
                    >
                      Abrir anúncio no Mercado Livre <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {activeItem.sync_error && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                  {activeItem.sync_error}
                </div>
              )}

              {/* Controles Editáveis (Preço c/ CurrencyInput, Estoque e Status) */}
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Preço de Venda no Mercado Livre (R$)
                  </label>
                  <CurrencyInput
                    value={editPrice}
                    onChangeValue={setEditPrice}
                    prefixStr="R$ "
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Saldo Disponível ML
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={String(editStock)}
                      onChange={(e) =>
                        setEditStock(Number(e.target.value.replace(/\D/g, '') || 0))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Status no ML
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                    >
                      <option value="active">Ativo</option>
                      <option value="paused">Pausado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Ações Únicas do Registro Selecionado */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDeleteListing(activeItem.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Desvincular
                </button>

                <button
                  type="button"
                  onClick={handleSaveListingEdit}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Salvar Alterações (F2)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra Inferior de Navegação Estilo Access Moderno */}
      <MeliAccessFooter
        currentIndex={activeIndex}
        totalCount={listings.length}
        onSelectIndex={setActiveIndex}
        extraHints={['↑↓ Selecionar Anúncio', 'F2 Salvar Ficha Lateral', 'Home/End Início/Fim']}
      />

      {/* Histórico Compacto de Sincronizações Delta */}
      {logs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <History className="h-3.5 w-3.5 text-indigo-500" />
            Histórico de Sincronizações Recentes (Delta Engine)
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {logs.map((l) => (
              <div
                key={l.id}
                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono text-[10px] font-bold">
                    {l.sync_type}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">{l.message}</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px] shrink-0">
                  {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
