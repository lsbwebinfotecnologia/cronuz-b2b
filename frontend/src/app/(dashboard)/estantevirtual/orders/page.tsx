'use client';

import { useState, useEffect } from 'react';
import {
  PackageCheck,
  Search,
  Truck,
  Send,
  FileText,
  XCircle,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { EvStepHeader, EvAccessFooter } from '@/components/estantevirtual/EvStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EvOrderItem {
  id: number;
  ev_order_id: string;
  ev_store_order_id: string | null;
  payment_id: string | null;
  status_codigo: string;
  shipping_method: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  cancel_reason: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_doc_type: string | null;
  buyer_doc_number: string | null;
  buyer_phone: string | null;
  total_amount: number;
  shipping_cost: number;
  discount_amount: number;
  payment_method: string | null;
  installments: number;
  cronuz_order_id: number | null;
  horus_pedido_venda: string | null;
  items_json: any[];
  shipping_address_json: Record<string, any>;
  invoice_data_json: Record<string, any>;
  sync_error: string | null;
  estimated_delivery_date: string | null;
  ev_created_at: string | null;
}

export default function EstanteVirtualOrdersPage() {
  const [orders, setOrders] = useState<EvOrderItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [sendingHorus, setSendingHorus] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Controles de Expedição (Exclusividade Correios vs Transportadora exigida pela EV)
  const [trackingMode, setTrackingMode] = useState<'CORREIOS' | 'TRANSPORTADORA'>('CORREIOS');
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [cancelReason, setCancelReason] = useState('sem_estoque');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`${API_URL}/estantevirtual/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rows: EvOrderItem[] = data.items || [];
        setOrders(rows);
        setActiveIndex((prev) => (rows.length > 0 ? Math.min(prev, rows.length - 1) : 0));
      }
    } catch {
      toast.error('Erro ao carregar pedidos da Estante Virtual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const activeOrder = orders[activeIndex] || null;

  useEffect(() => {
    if (activeOrder) {
      if (activeOrder.tracking_url) {
        setTrackingMode('TRANSPORTADORA');
        setTrackingUrl(activeOrder.tracking_url);
        setTrackingCode('');
      } else {
        setTrackingMode('CORREIOS');
        setTrackingCode(activeOrder.tracking_code || '');
        setTrackingUrl('');
      }
      setCancelReason(activeOrder.cancel_reason || 'sem_estoque');
    }
  }, [activeIndex, activeOrder?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((p) => Math.min(Math.max(0, orders.length - 1), p + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSendToHorus = async () => {
    if (!activeOrder) return;
    setSendingHorus(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/orders/${activeOrder.id}/send-to-horus`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Pedido enviado ao Horus ERP em CAIXA ALTA!');
        fetchOrders();
      } else {
        toast.error(data.detail || 'Falha ao enviar pedido para o Horus ERP.');
      }
    } catch {
      toast.error('Erro de conexão ao enviar pedido ao Horus.');
    } finally {
      setSendingHorus(false);
    }
  };

  const handleMarkSent = async () => {
    if (!activeOrder) return;
    setUpdatingStatus(true);
    try {
      const token = getToken();
      const body: Record<string, any> = {
        status_codigo: 'SENT',
      };
      if (trackingMode === 'CORREIOS') {
        body.rastreio = trackingCode.trim();
      } else {
        body.url_rastreio = trackingUrl.trim();
      }

      const res = await fetch(`${API_URL}/estantevirtual/orders/${activeOrder.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Pedido marcado como SENT (Enviado) na Estante Virtual!');
        fetchOrders();
      } else {
        toast.error(data.detail || 'Falha ao enviar rastreio para a Estante Virtual.');
      }
    } catch {
      toast.error('Erro ao atualizar status do pedido.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    setUpdatingStatus(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/orders/${activeOrder.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status_codigo: 'CANCELED',
          razao_cancelamento: cancelReason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Pedido cancelado na Estante Virtual.');
        fetchOrders();
      } else {
        toast.error(data.detail || 'Não foi possível cancelar o pedido.');
      }
    } catch {
      toast.error('Falha de rede ao cancelar pedido.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDownloadMleLabel = async (evOrderId: string) => {
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/estantevirtual/orders/shipping-labels?ids=${encodeURIComponent(evOrderId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        toast.success(`Etiqueta Magalu Entregas (MLE) do pedido #${evOrderId} gerada!`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.detail || 'Etiqueta MLE indisponível para este pedido.');
      }
    } catch {
      toast.error('Erro ao baixar etiqueta PDF da Estante Virtual.');
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <EvStepHeader
        currentStep={4}
        title="Pedidos Estante Virtual, Envio Horus ERP, Rastreio & Etiquetas MLE"
        explanation="Gerencie os pedidos recebidos via Webhook (POST/PUT /pedido), envie ao Horus ERP em CAIXA ALTA, informe código Correios ou URL de transportadora e imprima etiquetas Magalu Entregas."
        guideSteps={[
          'Selecione um pedido na planilha para ver itens, endereço e dados_nota_fiscal (Pix/Cartão)',
          'Clique em "Enviar Pedido ao Horus ERP" para faturar (insere em CAIXA ALTA com prefixo EV)',
          'Informe o Rastreio Correios OU URL Transportadora (nunca ambos) para mudar para SENT',
        ]}
        actions={
          <button
            type="button"
            onClick={fetchOrders}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar Lista
          </button>
        }
      />

      {/* Barra de Filtro */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            placeholder="Buscar por Nº Pedido EV, Nome do Comprador ou CPF/CNPJ..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'STANDBY', 'PROCESSING', 'SENT', 'CANCELED', 'EXPIRED'].map((st) => (
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
              {st === 'ALL' ? 'Todos' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Grade de Pedidos + Ficha Lateral de Expedição */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold uppercase text-slate-500">
                  <th className="py-2.5 px-3">Pedido EV</th>
                  <th className="py-2.5 px-3">Comprador &amp; Doc</th>
                  <th className="py-2.5 px-3">Envio / Pagto</th>
                  <th className="py-2.5 px-3 text-right">Total / Frete</th>
                  <th className="py-2.5 px-3 text-center">Status EV</th>
                  <th className="py-2.5 px-3 text-center">Horus ERP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Carregando pedidos da Estante Virtual...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Nenhum pedido recebido ainda no webhook <code className="font-mono">/estantevirtual/webhook/pedido</code>.
                    </td>
                  </tr>
                ) : (
                  orders.map((ord, idx) => {
                    const isSelected = idx === activeIndex;
                    return (
                      <tr
                        key={ord.id}
                        onClick={() => setActiveIndex(idx)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/40 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono">
                          <div className="font-extrabold text-indigo-600 dark:text-indigo-400">
                            #{ord.ev_order_id}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {ord.ev_created_at || 'Recente'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">
                            {ord.buyer_name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {ord.buyer_doc_type}: {ord.buyer_doc_number}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[11px]">
                            {ord.shipping_method || 'Correios'}
                          </div>
                          <div className="text-[10px] text-slate-400">{ord.payment_method}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="font-extrabold text-emerald-700 dark:text-emerald-400">
                            R$ {Number(ord.total_amount || 0).toFixed(2).replace('.', ',')}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Frete: R$ {Number(ord.shipping_cost || 0).toFixed(2).replace('.', ',')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold ${
                              ord.status_codigo === 'SENT'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : ord.status_codigo === 'STANDBY'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : ord.status_codigo === 'CANCELED' || ord.status_codigo === 'EXPIRED'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                            }`}
                          >
                            {ord.status_codigo}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                          {ord.horus_pedido_venda ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                              <CheckCircle2 className="h-3 w-3" /> #{ord.horus_pedido_venda}
                            </span>
                          ) : (
                            <span className="text-slate-400">Pendente</span>
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

        {/* Ficha Lateral do Pedido: Dados Fiscais, Envio ao Horus, Rastreio Mutuamente Exclusivo e Etiqueta MLE */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
          {!activeOrder ? (
            <p className="text-xs text-slate-400 py-10 text-center">
              Selecione um pedido na planilha à esquerda para gerenciar expedição, rastreio, etiquetas MLE e envio ao Horus ERP.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Pedido Estante Virtual #{activeOrder.ev_order_id}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Cronuz ID: #{activeOrder.cronuz_order_id || 'N/A'} • Pagto: {activeOrder.payment_id || 'N/A'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadMleLabel(activeOrder.ev_order_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" /> Etiqueta MLE (PDF)
                  </button>
                  <button
                    type="button"
                    onClick={handleSendToHorus}
                    disabled={sendingHorus}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {sendingHorus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {activeOrder.horus_pedido_venda ? `Reenviar Horus (#${activeOrder.horus_pedido_venda})` : 'Enviar p/ Horus ERP'}
                  </button>
                </div>
              </div>

              {/* Itens e Endereço */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  Destinatário: {activeOrder.shipping_address_json?.receiver_name || activeOrder.buyer_name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {activeOrder.shipping_address_json?.street}, {activeOrder.shipping_address_json?.number}{' '}
                  {activeOrder.shipping_address_json?.complement} — {activeOrder.shipping_address_json?.neighborhood},{' '}
                  {activeOrder.shipping_address_json?.city}/{activeOrder.shipping_address_json?.state} • CEP:{' '}
                  {activeOrder.shipping_address_json?.zip_code}
                </p>
                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 space-y-1">
                  {(activeOrder.items_json || []).map((it: any, i: number) => (
                    <div key={i} className="flex items-center justify-between font-mono text-[11px]">
                      <span className="truncate max-w-[260px]">
                        {it.quantity}x [{it.sku}] {it.title}
                      </span>
                      <span className="font-bold">R$ {Number(it.total_price || 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dados para Nota Fiscal enviados pela EV (dados_nota_fiscal) */}
              {activeOrder.invoice_data_json && Object.keys(activeOrder.invoice_data_json).length > 0 && (
                <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900 text-[11px] space-y-1 font-mono">
                  <p className="font-sans font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Dados Fiscais do Pagamento (<code className="font-mono">dados_nota_fiscal</code>)
                  </p>
                  <div>CNPJ Instituição: {activeOrder.invoice_data_json.cnpj_instituicao_financeira || '-'}</div>
                  <div>Autorização: {activeOrder.invoice_data_json.codigo_autorizacao || '-'} • Bandeira: {activeOrder.invoice_data_json.bandeira || '-'}</div>
                  {activeOrder.invoice_data_json.e2e_id_pix && (
                    <div>E2E Pix: {activeOrder.invoice_data_json.e2e_id_pix}</div>
                  )}
                </div>
              )}

              {/* Despacho & Rastreio (Trava Mutuamente Exclusiva da Estante Virtual) */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-indigo-600" />
                    Informar Envio (<code className="font-mono">PUT /pedido</code> → <code className="font-mono">SENT</code>)
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setTrackingMode('CORREIOS')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        trackingMode === 'CORREIOS'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Correios (rastreio)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrackingMode('TRANSPORTADORA')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        trackingMode === 'TRANSPORTADORA'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Transportadora (URL)
                    </button>
                  </div>
                </div>

                {trackingMode === 'CORREIOS' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Código de Rastreio Correios (<code className="font-mono">rastreio</code>)
                    </label>
                    <input
                      type="text"
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                      placeholder="Ex: AA123456789BR"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs uppercase"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      URL de Rastreamento da Transportadora (<code className="font-mono">url_rastreio</code>)
                    </label>
                    <input
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://rastreio.transportadora.com.br/..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleMarkSent}
                  disabled={updatingStatus}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  Confirmar Envio (SENT) na Estante Virtual
                </button>
              </div>

              {/* Cancelamento Oficial */}
              <div className="p-3 rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/20 flex items-center justify-between gap-2 text-xs">
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  <option value="sem_estoque">Motivo: sem_estoque</option>
                  <option value="erro_processamento">Motivo: erro_processamento</option>
                  <option value="cliente_devolveu">Motivo: cliente_devolveu</option>
                </select>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  disabled={updatingStatus}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancelar Pedido EV
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <EvAccessFooter
        currentIndex={activeIndex}
        totalCount={orders.length}
        onSelectIndex={setActiveIndex}
      />
    </div>
  );
}
