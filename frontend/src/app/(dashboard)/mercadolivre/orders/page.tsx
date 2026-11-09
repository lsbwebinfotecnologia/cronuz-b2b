'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  RefreshCw,
  Truck,
  CheckCircle2,
  Printer,
  Send,
  Search,
  DollarSign,
  Database,
  Loader2,
  Package,
  FileSpreadsheet,
  UserCheck,
  MapPin,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { MeliStepHeader, MeliAccessFooter } from '@/components/mercadolivre/MeliStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface MeliOrderRow {
  id: number;
  meli_order_id: string;
  meli_pack_id: string | null;
  meli_shipment_id: string | null;
  status: string;
  shipping_status: string | null;
  logistic_type: string | null;
  buyer_nickname: string | null;
  buyer_name: string | null;
  buyer_doc_type: string | null;
  buyer_doc_number: string | null;
  total_amount: number;
  meli_fee: number;
  cronuz_order_id: number | null;
  horus_pedido_venda: string | null;
  invoice_xml_sent: boolean;
  items_json: Array<{
    meli_item_id: string;
    title: string;
    sku: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  shipping_address_json: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    receiver_name?: string;
  };
  sync_error: string | null;
  created_at: string | null;
}

export default function MercadoLivreOrdersPage() {
  const [orders, setOrders] = useState<MeliOrderRow[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [kpis, setKpis] = useState({
    total_orders: 0,
    total_revenue: 0,
    ready_to_ship: 0,
    sent_to_horus: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sendingHorusId, setSendingHorusId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`${API_URL}/mercadolivre/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rows: MeliOrderRow[] = data.items || [];
        setOrders(rows);
        setActiveIndex((prev) => (rows.length > 0 ? Math.min(prev, rows.length - 1) : 0));
        if (data.kpis) setKpis(data.kpis);
      }
    } catch {
      toast.error('Não foi possível carregar os pedidos do Mercado Livre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const activeOrder = orders[activeIndex] || null;

  // Navegação por teclado estilo Planilha Excel / Access Moderno
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (orders.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(orders.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(orders.length - 1);
      } else if (e.key === 'F2' && activeOrder && !activeOrder.horus_pedido_venda) {
        e.preventDefault();
        handleSendToHorus(activeOrder.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, activeIndex, activeOrder]);

  const handleSyncOrders = async () => {
    setSyncing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/orders/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Verifique a conexão da sua conta na Etapa 1 (Pré-Configurações).');
        return;
      }
      toast.success(data.message || 'Pedidos sincronizados com sucesso!');
      fetchOrders();
    } catch {
      toast.error('Falha de comunicação ao buscar pedidos no Mercado Livre.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSendToHorus = async (orderId: number) => {
    setSendingHorusId(orderId);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/orders/${orderId}/send-to-horus`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Não foi possível enviar o pedido para o Horus ERP.');
        return;
      }
      toast.success(data.message || 'Pedido enviado para o Horus ERP com sucesso!');
      fetchOrders();
    } catch {
      toast.error('Erro de conexão ao enviar pedido ao Horus ERP.');
    } finally {
      setSendingHorusId(null);
    }
  };

  const handleDownloadLabel = async (orderId: number, format: 'pdf' | 'zpl2') => {
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/mercadolivre/orders/${orderId}/shipping-label?response_type=${format}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Etiqueta ainda não liberada pelo Mercado Envios.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiqueta_ml_${orderId}.${format === 'pdf' ? 'pdf' : 'zip'}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao baixar etiqueta do Mercado Envios.');
    }
  };

  const formatBRL = (val: number) =>
    (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4 pb-8">
      {/* Cabeçalho Unificado com Stepper de 4 Etapas e Botão Único de Busca */}
      <MeliStepHeader
        currentStep={4}
        title="Mesa de Pedidos Mercado Livre, Envio ao Horus ERP & Etiquetas"
        explanation="Vendas aprovadas entram automaticamente via Webhook (ou busca manual), geram pedido no Cronuz e ficam prontas para o Horus ERP."
        guideSteps={[
          'Selecione um pedido na planilha à esquerda (setas ↑↓)',
          'Confira comprador, CPF/CNPJ, endereço e itens na Ficha Lateral',
          'Envie ao Horus ERP (F2) e imprima a etiqueta oficial Mercado Envios',
        ]}
        actions={
          <button
            type="button"
            onClick={handleSyncOrders}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Buscar Novos Pedidos no ML
          </button>
        }
      />

      {/* KPIs Compactos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Pedidos Recebidos</span>
            <p className="text-xl font-black text-slate-900 dark:text-white">{kpis.total_orders}</p>
          </div>
          <ShoppingBag className="h-5 w-5 text-amber-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Receita Aprovada</span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {formatBRL(kpis.total_revenue)}
            </p>
          </div>
          <DollarSign className="h-5 w-5 text-emerald-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Prontos p/ Envio</span>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">
              {kpis.ready_to_ship}
            </p>
          </div>
          <Truck className="h-5 w-5 text-indigo-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Integrados Horus</span>
            <p className="text-xl font-black text-teal-600 dark:text-teal-400">
              {kpis.sent_to_horus}
            </p>
          </div>
          <Database className="h-5 w-5 text-teal-500" />
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
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            placeholder="Filtrar por Nº do Pedido ML, nome do comprador ou CPF/CNPJ e pressionar Enter..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['ALL', 'paid', 'cancelled'] as const).map((st) => (
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
              {st === 'ALL' ? 'Todos' : st === 'paid' ? 'Pagos / Aprovados' : 'Cancelados'}
            </button>
          ))}
        </div>
      </div>

      {/* Layout Mestre-Detalhe Estilo Access Moderno (Planilha de Pedidos + Ficha Completa do Pedido) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Coluna Esquerda (7 cols): Planilha de Pedidos (Sem botões repetidos em cada linha!) */}
        <div className="xl:col-span-7 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-50/80 dark:bg-slate-900/60">
                <th className="py-3 px-3.5">Pedido ML</th>
                <th className="py-3 px-3">Comprador / Doc</th>
                <th className="py-3 px-3 text-center">Qtd Itens</th>
                <th className="py-3 px-3 text-right">Total</th>
                <th className="py-3 px-3.5 text-center">Status ERP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Carregando planilha de pedidos...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <Package className="h-7 w-7 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">Nenhum pedido recebido até o momento.</p>
                  </td>
                </tr>
              ) : (
                orders.map((ord, idx) => {
                  const isFocused = idx === activeIndex;
                  const totalUnits = (ord.items_json || []).reduce(
                    (acc, it) => acc + (Number(it.quantity) || 1),
                    0
                  );
                  return (
                    <tr
                      key={ord.id}
                      onClick={() => setActiveIndex(idx)}
                      className={`cursor-pointer transition ${
                        isFocused
                          ? 'bg-amber-50/90 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-400/60'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono">
                        <div className="font-bold text-slate-900 dark:text-white">
                          #{ord.meli_order_id}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {ord.created_at
                            ? new Date(ord.created_at).toLocaleDateString('pt-BR')
                            : '—'}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                          {ord.buyer_name || ord.buyer_nickname || 'Comprador ML'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {ord.buyer_doc_type || 'DOC'}: {ord.buyer_doc_number || '—'}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                          {totalUnits} un.
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatBRL(ord.total_amount)}
                      </td>

                      <td className="py-2.5 px-3.5 text-center">
                        {ord.horus_pedido_venda ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono text-[11px] font-bold">
                            <CheckCircle2 className="h-3 w-3" /> #{ord.horus_pedido_venda}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                            Pendente Horus
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

        {/* Coluna Direita (5 cols): Ficha Completa do Pedido Selecionado (Access Moderno) */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 sticky top-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                Ficha Operacional do Pedido
              </h3>
            </div>
            {activeOrder && (
              <span className="font-mono text-[11px] px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">
                ML #{activeOrder.meli_order_id}
              </span>
            )}
          </div>

          {!activeOrder ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Selecione um pedido na planilha ao lado (ou use as setas ↑↓) para visualizar os detalhes fiscais, itens, envio ao Horus e etiqueta.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Seção A: Dados do Comprador e Endereço */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                    {activeOrder.buyer_name || activeOrder.buyer_nickname}
                  </span>
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                    {activeOrder.buyer_doc_type || 'DOC'}: {activeOrder.buyer_doc_number || '—'}
                  </span>
                </div>

                {activeOrder.shipping_address_json?.street && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-700">
                    <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      {activeOrder.shipping_address_json.street},{' '}
                      {activeOrder.shipping_address_json.number} —{' '}
                      {activeOrder.shipping_address_json.neighborhood} —{' '}
                      {activeOrder.shipping_address_json.city}/
                      {activeOrder.shipping_address_json.state} (CEP:{' '}
                      {activeOrder.shipping_address_json.zip_code})
                    </span>
                  </div>
                )}
              </div>

              {/* Seção B: Itens do Pedido */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  Itens Comprados ({activeOrder.items_json?.length || 0}):
                </span>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {(activeOrder.items_json || []).map((it, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {it.quantity}x {it.title}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          ISBN/SKU: {it.sku || '—'} | MLB: {it.meli_item_id}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                        {formatBRL(it.total_price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção C: Resumo Financeiro e Vínculos Cronuz / Horus */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 font-mono">
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Total Pago</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatBRL(activeOrder.total_amount)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Tarifa ML</span>
                  <span className="font-bold text-rose-500">
                    -{formatBRL(activeOrder.meli_fee)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Líquido Est.</span>
                  <span className="font-bold text-emerald-600">
                    {formatBRL(Math.max(0, activeOrder.total_amount - activeOrder.meli_fee))}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] px-1">
                <div>
                  Pedido Interno Cronuz:{' '}
                  {activeOrder.cronuz_order_id ? (
                    <Link
                      href={`/orders/${activeOrder.cronuz_order_id}`}
                      className="font-mono font-bold text-indigo-600 hover:underline"
                    >
                      #{activeOrder.cronuz_order_id}
                    </Link>
                  ) : (
                    '—'
                  )}
                </div>
                <div>
                  Pedido Horus ERP:{' '}
                  <strong className="font-mono text-emerald-600">
                    {activeOrder.horus_pedido_venda
                      ? `#${activeOrder.horus_pedido_venda}`
                      : 'Ainda não enviado'}
                  </strong>
                </div>
              </div>

              {activeOrder.sync_error && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-[11px] text-rose-700 font-medium">
                  {activeOrder.sync_error}
                </div>
              )}

              {/* Seção D: Botões Únicos de Ação Operacional do Pedido Selecionado */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  {activeOrder.meli_shipment_id && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownloadLabel(activeOrder.id, 'pdf')}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Etiqueta PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadLabel(activeOrder.id, 'zpl2')}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Formato ZPL2 para Impressora Térmica Zebra"
                      >
                        ZPL
                      </button>
                    </>
                  )}
                </div>

                {!activeOrder.horus_pedido_venda && (
                  <button
                    type="button"
                    onClick={() => handleSendToHorus(activeOrder.id)}
                    disabled={sendingHorusId === activeOrder.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {sendingHorusId === activeOrder.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Enviar p/ Horus ERP (F2)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra Inferior de Navegação Estilo Access Moderno */}
      <MeliAccessFooter
        currentIndex={activeIndex}
        totalCount={orders.length}
        onSelectIndex={setActiveIndex}
        extraHints={[
          '↑↓ Selecionar Pedido',
          'F2 Enviar Pedido Selecionado ao Horus ERP',
          'Home/End Início/Fim',
        ]}
      />
    </div>
  );
}
