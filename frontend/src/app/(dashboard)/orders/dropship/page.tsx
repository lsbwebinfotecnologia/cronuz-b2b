'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PackageCheck, RefreshCw, ArrowUpFromLine, Loader2,
  FileText, Tag, ShoppingCart, CheckCircle2, Truck, X, MapPin, Download,
  AlertTriangle, Clock, Send, PackageX, Filter,
  Printer, Eye, Ban
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface DropshipOrder {
  id: number;
  company_id: number;
  config_id: number;
  external_order_id: string;
  external_reference: string | null;
  channel: string | null;
  status: string;
  released_at: string | null;
  customer_data: any;
  items_data: any[];
  logistics_data: any;
  fiscal_data: any;
  horus_pedido_remessa: string | null;
  horus_pedido_venda: string | null;
  tracking_code: string | null;
  nfe_remessa_key: string | null;
  label_path: string | null;
  danfe_path: string | null;
  xml_path: string | null;
  synced_at: string | null;
  sent_to_horus_at: string | null;
  dispatched_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  erdos_credential_id: number | null;
  erdos_credential_label: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function CancelOrderModal({
  order,
  isOpen,
  onClose,
  onConfirm,
  loading,
}: {
  order: DropshipOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Cancelar Pedido</h3>
              <p className="text-xs text-slate-400">{order.external_reference || `#${order.id}`}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Esta ação marcará o pedido como <strong>Cancelado</strong> no sistema e notificará o Hub-Erdos.
            {order.status === 'SENT_TO_HORUS' && (
              <span className="block mt-1 font-semibold text-rose-600 dark:text-rose-400">
                Atenção: Este pedido já foi enviado ao Hórus. Cancele também os pedidos correspondentes no Hórus ERP.
              </span>
            )}
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Motivo / Justificativa do Cancelamento *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Cliente solicitou cancelamento / Produto sem estoque físico..."
            rows={3}
            disabled={loading}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={loading || reason.trim().length < 3}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-md"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            Confirmar Cancelamento
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40', icon: Clock },
  SENT_TO_HORUS: { label: 'Enviado ao Hórus', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700/40', icon: Send },
  DISPATCHED: { label: 'Despachado', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-700/40', icon: PackageX },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

interface ConfirmDispatchModalProps {
  order: DropshipOrder;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfirmDispatchModal({ order, companyId, onClose, onSuccess }: ConfirmDispatchModalProps) {
  const [trackingCode, setTrackingCode] = useState('');
  const [nfeKey, setNfeKey] = useState('');
  const [sending, setSending] = useState(false);

  const handleConfirm = async () => {
    setSending(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/confirm-dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_code: trackingCode || null, nfe_remessa_key: nfeKey || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Despacho confirmado com sucesso!');
        onSuccess();
        onClose();
      } else {
        toast.error(`Erro: ${data.detail || 'Erro ao confirmar despacho'}`);
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Truck className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Confirmar Despacho</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Pedido: <strong className="text-slate-700 dark:text-slate-300">{order.external_reference || order.external_order_id}</strong>
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Código de Rastreamento (Correios)
            </label>
            <input
              type="text"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
              placeholder="Ex: BR123456789BR"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Chave NF-e de Remessa (6.923)
            </label>
            <input
              type="text"
              value={nfeKey}
              onChange={e => setNfeKey(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
              placeholder="35260631492667000182..."
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 rounded-xl transition-all disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar Despacho
          </button>
        </div>
      </motion.div>
    </div>
  );
}

interface OrderDetailDrawerProps {
  order: DropshipOrder;
  companyId: string;
  onClose: () => void;
  onSendToHorus: () => void;
  onConfirmDispatch: () => void;
  sendingToHorus: boolean;
}

function OrderDetailDrawer({ order, companyId, onClose, onSendToHorus, onConfirmDispatch, sendingToHorus }: OrderDetailDrawerProps) {
  const customer = order.customer_data || {};
  const items = order.items_data || [];
  const logistics = order.logistics_data || {};
  const fiscal = order.fiscal_data || {};

  const handleDownload = async (docType: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/documents/${docType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, '_blank');
      } else {
        const err = await res.json();
        toast.error(err.detail || `Documento ${docType} não disponível`);
      }
    } catch {
      toast.error('Erro ao obter documento');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-600/5 to-purple-600/5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {order.external_reference || order.external_order_id}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <span className="text-xs text-slate-400">{order.channel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Pedidos Hórus */}
          {(order.horus_pedido_remessa || order.horus_pedido_venda) && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Pedidos Hórus Gerados</p>
              {order.horus_pedido_remessa && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-600 dark:text-blue-400">Remessa (6.923):</span>
                  <span className="text-xs font-mono font-bold text-blue-800 dark:text-blue-200">#{order.horus_pedido_remessa}</span>
                </div>
              )}
              {order.horus_pedido_venda && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-600 dark:text-blue-400">Venda (6.118):</span>
                  <span className="text-xs font-mono font-bold text-blue-800 dark:text-blue-200">#{order.horus_pedido_venda}</span>
                </div>
              )}
            </div>
          )}

          {/* Cliente Final */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> Destinatário
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white">{customer.nome || '—'}</p>
              {customer.cpf_cnpj && <p className="text-slate-500">CPF/CNPJ: {customer.cpf_cnpj}</p>}
              <p className="text-slate-600 dark:text-slate-300">
                {[customer.endereco, customer.numero, customer.complemento].filter(Boolean).join(', ')}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {[customer.bairro, customer.cidade, customer.uf].filter(Boolean).join(' · ')}
              </p>
              {customer.cep && <p className="text-slate-500">CEP: {customer.cep}</p>}
            </div>
          </div>

          {/* Itens */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ShoppingCart className="w-3.5 h-3.5" /> Itens ({items.length})
            </h3>
            <div className="space-y-2">
              {items.map((item: any, i: number) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <Tag className="w-3.5 h-3.5 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.titulo || item.title || '—'}</p>
                    <p className="text-[10px] text-slate-400 font-mono">ISBN: {item.sku_fornecedor}</p>
                    <p className="text-[10px] text-slate-500">Qtd: {item.quantidade}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Logística */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5" /> Logística
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs space-y-1.5">
              {logistics.forma_envio && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Forma de Envio</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{logistics.forma_envio}</span>
                </div>
              )}
              {order.tracking_code && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Rastreamento</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{order.tracking_code}</span>
                </div>
              )}
            </div>
          </div>

          {/* NF-e */}
          {fiscal.chave_nfe_erdos && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> NF-e Erdos (6.120)
              </h3>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs">
                <p className="font-mono text-[10px] text-slate-500 break-all">{fiscal.chave_nfe_erdos}</p>
              </div>
            </div>
          )}

          {/* Downloads */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Download className="w-3.5 h-3.5" /> Documentos
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'xml', label: 'XML NF-e', icon: FileText, available: !!order.xml_path },
                { type: 'danfe', label: 'DANFE', icon: Printer, available: !!order.danfe_path },
                { type: 'etiqueta', label: 'Etiqueta', icon: Tag, available: !!order.label_path },
              ].map(doc => (
                <button
                  key={doc.type}
                  onClick={() => handleDownload(doc.type)}
                  disabled={!doc.available}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border text-xs font-medium transition-all ${
                    doc.available
                      ? 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-700/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/20'
                      : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/30 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <doc.icon className="w-4 h-4" />
                  {doc.label}
                  {!doc.available && <span className="text-[9px] opacity-60">Indisponível</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Histórico</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Sincronizado', date: order.synced_at },
                { label: 'Enviado ao Hórus', date: order.sent_to_horus_at },
                { label: 'Despachado', date: order.dispatched_at },
              ].filter(e => e.date).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  <span>{e.label}:</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatDate(e.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {order.status === 'PENDING' && (
            <button
              onClick={onSendToHorus}
              disabled={sendingToHorus}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
            >
              {sendingToHorus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar para o Hórus
            </button>
          )}
          {order.status === 'SENT_TO_HORUS' && (
            <button
              onClick={onConfirmDispatch}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-semibold rounded-xl transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Despacho
            </button>
          )}
          {order.status === 'DISPATCHED' && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Pedido Concluído
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function DropshipOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<DropshipOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pushingStock, setPushingStock] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [cancelModalOrder, setCancelModalOrder] = useState<DropshipOrder | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  // Get company ID from auth
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCompanyId(String(payload.company_id || ''));
      } catch { /* ignore */ }
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const url = statusFilter
        ? `${API_URL}/dropship/orders/${companyId}?status=${statusFilter}`
        : `${API_URL}/dropship/orders/${companyId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => {
    if (companyId) fetchOrders();
  }, [fetchOrders]);

  const handleConfirmCancel = async (reason: string) => {
    if (!companyId || !cancelModalOrder) return;
    setCancellingOrder(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/dropship/orders/${companyId}/${cancelModalOrder.id}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(`Pedido #${cancelModalOrder.external_reference || cancelModalOrder.id} cancelado com sucesso.`);
        setCancelModalOrder(null);
        fetchOrders();
      } else {
        toast.error(`Erro ao cancelar: ${data.detail || 'Não foi possível cancelar o pedido.'}`);
      }
    } catch {
      toast.error('Erro de conexão ao cancelar o pedido.');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        // Toast principal
        if (data.synced === 0) {
          toast.success('Sincronizado! Nenhum pedido novo encontrado.');
        } else {
          toast.success(`Sincronizado! ${data.synced} novo(s) pedido(s) importado(s).`);
        }
        // Breakdown por credencial — toasts secundários
        if (data.by_credential && data.by_credential.length > 1) {
          data.by_credential.forEach((c: { label: string; hub_total: number; synced: number }) => {
            toast.info(`${c.label}: ${c.hub_total} no Hub · ${c.synced} novos`, {
              duration: 6000,
            });
          });
        }
        fetchOrders();
      } else {
        toast.error(`Erro: ${data.detail}`);
      }
    } catch {
      toast.error('Erro ao sincronizar pedidos.');
    } finally {
      setSyncing(false);
    }
  };

  const handlePushStock = async () => {
    if (!companyId) return;
    setPushingStock(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/stock/${companyId}/push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Estoque enviado! ${data.skus_sent} SKU(s) atualizados no Hub-Erdos.`);
      } else {
        toast.error(`Erro: ${data.detail}`);
      }
    } catch {
      toast.error('Erro ao enviar estoque.');
    } finally {
      setPushingStock(false);
    }
  };

  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const sentCount = orders.filter(o => o.status === 'SENT_TO_HORUS').length;
  const dispatchedCount = orders.filter(o => o.status === 'DISPATCHED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <PackageCheck className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pedidos Dropship</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 ml-12">
            Hub Horus B2B
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePushStock}
            disabled={pushingStock || !companyId}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-all disabled:opacity-60"
          >
            {pushingStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
            Enviar Estoque
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !companyId}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar Pedidos
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: orders.length, color: 'from-slate-500 to-slate-600' },
          { label: 'Pendentes', value: pendingCount, color: 'from-amber-500 to-orange-500' },
          { label: 'No Hórus', value: sentCount, color: 'from-blue-500 to-indigo-500' },
          { label: 'Despachados', value: dispatchedCount, color: 'from-emerald-500 to-green-500' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4"
          >
            <div className={`text-2xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
              {stat.value}
            </div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <div className="flex gap-2 flex-wrap">
          {['', 'PENDING', 'SENT_TO_HORUS', 'DISPATCHED', 'CANCELLED'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === s
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {s === '' ? 'Todos' : (STATUS_CONFIG[s]?.label || s)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <PackageCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhum pedido Dropship encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Clique em "Sincronizar Pedidos" para buscar pedidos prontos para despacho no Hub Horus B2B</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                  {['Referência', 'Canal', 'Cliente', 'Itens', 'Status', 'Ped. Remessa', 'Data', 'Docs', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((order, i) => {
                  const customer = order.customer_data || {};
                  const items = order.items_data || [];
                  const logistics = order.logistics_data || {};
                  return (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-violet-50/30 dark:hover:bg-violet-900/5 transition-colors cursor-pointer"
                      onClick={() => router.push(`/orders/dropship/${order.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white text-xs">
                          {order.external_reference || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                          {order.external_order_id.substring(0, 12)}…
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 capitalize">{order.channel || '—'}</td>
                      <td className="px-4 py-3">
                         <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                           {(order.customer_data || {}).nome || '—'}
                         </div>
                         <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                           {[
                             (order.customer_data || {}).cidade,
                             (order.customer_data || {}).uf
                           ].filter(Boolean).join(' - ')}
                         </div>
                         {order.erdos_credential_label && (
                           <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/40">
                             {order.erdos_credential_label}
                           </span>
                         )}
                         <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                           {[
                             (order.customer_data || {}).endereco,
                             (order.customer_data || {}).numero,
                             (order.customer_data || {}).bairro,
                             (order.customer_data || {}).cep,
                           ].filter(Boolean).join(', ')}
                         </div>
                       </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full text-xs font-semibold">
                          <ShoppingCart className="w-3 h-3" />
                          {(order.items_data || []).length}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                        {order.status === 'CANCELLED' && order.cancel_reason && (
                          <span
                            className="block text-[10px] text-rose-500 font-medium truncate max-w-[130px] mt-0.5"
                            title={`Motivo: ${order.cancel_reason}`}
                          >
                            {order.cancel_reason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                        {order.horus_pedido_remessa ? `#${order.horus_pedido_remessa}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {order.released_at ? new Date(order.released_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      {/* Ícones de documentos disponíveis */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {order.xml_path && (
                            <span title="XML NF-e disponível" className="w-5 h-5 flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                              <FileText className="w-3 h-3" />
                            </span>
                          )}
                          {order.danfe_path && (
                            <span title="DANFE disponível" className="w-5 h-5 flex items-center justify-center rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                              <Printer className="w-3 h-3" />
                            </span>
                          )}
                          {order.label_path && (
                            <span title="Etiqueta disponível" className="w-5 h-5 flex items-center justify-center rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                              <Tag className="w-3 h-3" />
                            </span>
                          )}
                          {!order.xml_path && !order.danfe_path && !order.label_path && (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {order.status !== 'CANCELLED' && order.status !== 'DISPATCHED' && (
                            <button
                              title="Cancelar Pedido"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelModalOrder(order);
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            title="Ver Detalhes"
                            onClick={(e) => { e.stopPropagation(); router.push(`/orders/dropship/${order.id}`); }}
                            className="p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cancelamento de Pedido */}
      <CancelOrderModal
        order={cancelModalOrder}
        isOpen={!!cancelModalOrder}
        onClose={() => setCancelModalOrder(null)}
        onConfirm={handleConfirmCancel}
        loading={cancellingOrder}
      />
    </div>
  );
}
